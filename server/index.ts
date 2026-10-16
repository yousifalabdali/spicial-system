// Local / self-hosted website: serves the built React app (dist/) and POST /api/<name>.
// On Vercel the same API runs from api/[name].ts instead. Env vars are documented in server/app.ts.
//
//   npm run build && npm run build:server
//   PORT=3000 node dist-server/index.cjs          (local PGlite database in ./data)
//   DATABASE_URL=postgres://... node dist-server/index.cjs   (Supabase)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { handleApi, ready, securityHeaders, sendJson } from './app'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const DIST = path.resolve(__dirname, '../dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
}

// The built app's text files, compressed once and kept in memory (Brotli, else gzip): about a quarter of the bytes.
const packed = new Map<string, { br: Buffer; gz: Buffer }>()
function pack(file: string) {
  let p = packed.get(file)
  if (!p) {
    const raw = fs.readFileSync(file)
    p = {
      br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
      gz: zlib.gzipSync(raw, { level: 9 }),
    }
    packed.set(file, p)
  }
  return p
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json'])

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
  let rel = decodeURIComponent(urlPath)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = path.resolve(DIST, '.' + rel)
  if (!file.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end() }
  // The app uses hash routes, so anything unknown is the app shell.
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html')
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream',
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
  }
  const accept = String(req.headers['accept-encoding'] ?? '')
  const enc = !COMPRESSIBLE.has(path.extname(target)) ? null : /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gz' : null
  if (enc) {
    const body = pack(target)[enc]
    res.writeHead(200, { ...headers, 'Content-Encoding': enc === 'br' ? 'br' : 'gzip', 'Content-Length': body.length })
    return res.end(req.method === 'HEAD' ? undefined : body)
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(target).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true })
  const m = /^\/api\/([^/]+)$/.exec(url.pathname)
  if (m) {
    handleApi(req, res, m[1]).catch((e) => { console.error(e); if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Server error' }) })
    return
  }
  securityHeaders(res)
  serveStatic(req, res, url.pathname)
})

if (!fs.existsSync(path.join(DIST, 'index.html'))) console.warn(`Warning: ${DIST}/index.html not found. Run "npm run build" first.`)
// Start listening even if the database is down, so the website can show the reason (each request retries).
server.listen(PORT, HOST, () => console.log(`Sales Inventory Pro website: http://localhost:${PORT}  (database: ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'local PGlite'})`))
ready().catch((e) => console.error('Could not open the database:', e))
