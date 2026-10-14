// The website: serves the same React app as the desktop build, plus POST /api/<name>.
// Every API call goes through electron/api.ts, which checks the login and permissions.
//
//   npm run build && npm run build:server
//   PORT=3000 DATA_DIR=./data node dist-server/index.cjs
//
// Env: PORT (3000), HOST (0.0.0.0), DATA_DIR (./data, holds store.db),
//      TRUST_PROXY=1 behind nginx/Caddy/a host's load balancer (uses X-Forwarded-For/-Proto),
//      SEED_DEMO=1 to fill an empty database with demo data.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { openDb } from '../electron/db'
import { seedIfEmpty } from '../electron/db/seed'
import { createSession, deleteSession, hasUsers, sessionUser } from '../electron/db/users'
import { AuthError, dispatch, type Ctx } from '../electron/api'
import { backupPath, initBackups } from '../electron/backup'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
const TRUST_PROXY = process.env.TRUST_PROXY === '1'
const DIST = path.resolve(__dirname, '../dist')
const MAX_BODY = 1_000_000

fs.mkdirSync(DATA_DIR, { recursive: true })
openDb(path.join(DATA_DIR, 'store.db'))
if (process.env.SEED_DEMO === '1') seedIfEmpty()
initBackups({ defaultDir: path.join(DATA_DIR, 'backups'), canChooseDir: false })

// Until the first account exists, creating it needs this code from the server log,
// so a stranger who opens a fresh site first cannot make themselves the super admin.
const SETUP_CODE = randomBytes(4).toString('hex').toUpperCase()
if (!hasUsers()) console.log(`\n  First-time setup code: ${SETUP_CODE}\n  (enter it on the website to create the super admin account)\n`)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
}

function securityHeaders(res: http.ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
}

function getCookie(req: http.IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

const isHttps = (req: http.IncomingMessage) => (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || 'encrypted' in req.socket
const clientIp = (req: http.IncomingMessage) =>
  (TRUST_PROXY && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '?'

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('الطلب كبير جداً')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, name: string) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
  // Cross-site protection: only JSON bodies (a plain HTML form can't send them) from this same site.
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return sendJson(res, 415, { ok: false, error: 'JSON only' })
  const origin = req.headers.origin
  if (origin && URL.parse(origin)?.host !== req.headers.host) return sendJson(res, 403, { ok: false, error: 'Cross-site request blocked' })

  let args: unknown[]
  try {
    const body = JSON.parse((await readBody(req)) || '{}') as { args?: unknown }
    args = Array.isArray(body.args) ? body.args : []
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Bad request' })
  }

  const token = getCookie(req, 'sid')
  const cookies: string[] = []
  const secure = isHttps(req) ? '; Secure' : ''
  const ctx: Ctx = {
    user: sessionUser(token),
    login: (u) => {
      deleteSession(token)
      const s = createSession(u.id)
      cookies.push(`sid=${s.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${s.maxAgeSeconds}${secure}`)
    },
    logout: () => {
      deleteSession(token)
      cookies.push(`sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`)
    },
    clientKey: clientIp(req),
    setupCode: hasUsers() ? null : SETUP_CODE,
  }

  try {
    const data = await dispatch(name, args, ctx)
    if (cookies.length) res.setHeader('Set-Cookie', cookies)
    sendJson(res, 200, { ok: true, data })
  } catch (err) {
    if (cookies.length) res.setHeader('Set-Cookie', cookies)
    if (err instanceof AuthError) return sendJson(res, err.status, { ok: false, error: err.message, status: err.status })
    console.error(`[api:${name}]`, err)
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

/** A backup file, for super admins only (the session cookie is checked like an API call). */
function downloadBackup(req: http.IncomingMessage, res: http.ServerResponse, name: string) {
  if (sessionUser(getCookie(req, 'sid'))?.role !== 'super_admin') { res.writeHead(403); return res.end('Forbidden') }
  const file = backupPath(name)
  if (!file) { res.writeHead(404); return res.end('Not found') }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
  let rel = decodeURIComponent(urlPath)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = path.resolve(DIST, '.' + rel)
  if (!file.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end() }
  // The app uses hash routes, so anything unknown is the app shell.
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html')
  const ext = path.extname(target)
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(target).pipe(res)
}

const server = http.createServer((req, res) => {
  securityHeaders(res)
  const url = new URL(req.url ?? '/', 'http://local')
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true })
  const b = /^\/backups\/([^/]+)$/.exec(url.pathname)
  if (b) return downloadBackup(req, res, decodeURIComponent(b[1]))
  const m = /^\/api\/([A-Za-z]+)$/.exec(url.pathname)
  if (m) {
    handleApi(req, res, m[1]).catch((e) => { console.error(e); if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Server error' }) })
    return
  }
  serveStatic(req, res, url.pathname)
})

if (!fs.existsSync(path.join(DIST, 'index.html'))) console.warn(`Warning: ${DIST}/index.html not found. Run "npm run build" first.`)
server.listen(PORT, HOST, () => console.log(`Sales Inventory Pro website: http://localhost:${PORT}  (data: ${DATA_DIR})`))
