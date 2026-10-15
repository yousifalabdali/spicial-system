// The API request handler shared by the local Node server (server/index.ts) and Vercel (api/[name].ts).
//
// Env:
//   DATABASE_URL   Supabase connection string (Project Settings -> Database -> Connection pooling, port 6543).
//                  Unset = local PGlite database in DATA_DIR/pg (not allowed on Vercel).
//   SETUP_CODE     code required to create the first super admin. Required on Vercel; locally a random one is printed.
//   APP_TIMEZONE   shop time zone for dates (default Asia/Muscat).
//   TRUST_PROXY=1  behind a proxy/load balancer (automatic on Vercel).
//   SEED_DEMO=1    fill an empty database with demo data.
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { openDb } from '../electron/db'
import { seedIfEmpty } from '../electron/db/seed'
import { createSession, deleteSession, hasUsers, sessionUser } from '../electron/db/users'
import { AuthError, dispatch, type Ctx } from '../electron/api'

const ON_VERCEL = !!process.env.VERCEL
const TRUST_PROXY = ON_VERCEL || process.env.TRUST_PROXY === '1'
const MAX_BODY = 4_000_000 // restoring a backup with product photos can be a few MB (Vercel's own limit is 4.5 MB)

let SETUP_CODE: string | null = process.env.SETUP_CODE?.trim() || null
let started: Promise<void> | null = null

/** A user-facing reason for a database failure. Never includes the connection string. */
function dbErrorMessage(e: unknown) {
  const err = e as { code?: string; message?: string }
  const base = 'تعذّر الاتصال بقاعدة البيانات: '
  if (err.code === '28P01') return base + 'كلمة المرور في DATABASE_URL غير صحيحة'
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return base + 'عنوان الخادم في DATABASE_URL غير صحيح'
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') return base + 'لا يمكن الوصول للخادم. استخدم رابط Transaction pooler (المنفذ 6543)'
  if (/Tenant or user not found/i.test(err.message ?? '')) return base + 'اسم المستخدم في DATABASE_URL غير صحيح (يجب أن يكون postgres.رمز-المشروع)'
  if (/DATABASE_URL is not set/.test(err.message ?? '')) return base + 'متغيّر DATABASE_URL غير موجود'
  return base + (err.code ?? 'خطأ غير معروف')
}

/** Connect, create tables, maybe seed. Safe to call on every request (runs once). */
export function ready() {
  started ??= (async () => {
    const url = process.env.DATABASE_URL?.trim()
    if (!url && ON_VERCEL) throw new Error('DATABASE_URL is not set. Add your Supabase connection string in the Vercel project settings.')
    await openDb({ url, localDir: url ? undefined : path.join(path.resolve(process.env.DATA_DIR || './data'), 'pg') })
    if (process.env.SEED_DEMO === '1') await seedIfEmpty()
    // Locally, invent a setup code and show it in the console. On Vercel every instance would invent
    // a different one, so there it must come from the SETUP_CODE variable.
    if (!SETUP_CODE && !ON_VERCEL && !(await hasUsers())) {
      SETUP_CODE = randomBytes(4).toString('hex').toUpperCase()
      console.log(`\n  First-time setup code: ${SETUP_CODE}\n  (enter it on the website to create the super admin account)\n`)
    }
  })().catch((e) => { started = null; throw e })
  return started
}

export function securityHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'")
}

function getCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

const isHttps = (req: IncomingMessage) => (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || 'encrypted' in req.socket
const clientIp = (req: IncomingMessage) =>
  (TRUST_PROXY && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '?'

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** The request body as parsed JSON. Vercel has already parsed it into req.body; plain Node has not. */
async function readJson(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length
    if (size > MAX_BODY) throw new Error('too large')
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, name: string) {
  securityHeaders(res)
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' })
  // Cross-site protection: only JSON bodies (a plain HTML form can't send them) from this same site.
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return sendJson(res, 415, { ok: false, error: 'JSON only' })
  const origin = req.headers.origin
  if (origin && URL.parse(origin)?.host !== req.headers.host) return sendJson(res, 403, { ok: false, error: 'Cross-site request blocked' })
  if (!/^[A-Za-z]{1,64}$/.test(name)) return sendJson(res, 404, { ok: false, error: 'Not found' })

  let args: unknown[]
  try {
    const body = (await readJson(req)) as { args?: unknown }
    args = Array.isArray(body?.args) ? body.args : []
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Bad request' })
  }

  try {
    await ready()
  } catch (e) {
    console.error('[db]', e)
    return sendJson(res, 503, { ok: false, error: dbErrorMessage(e) })
  }

  const token = getCookie(req, 'sid')
  const cookies: string[] = []
  const secure = isHttps(req) ? '; Secure' : ''
  const ctx: Ctx = {
    user: await sessionUser(token).catch((e) => { console.error('[session]', e); throw e }),
    login: async (u) => {
      await deleteSession(token)
      const s = await createSession(u.id)
      cookies.push(`sid=${s.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${s.maxAgeSeconds}${secure}`)
    },
    logout: async () => {
      await deleteSession(token)
      cookies.push(`sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`)
    },
    clientKey: clientIp(req),
    setupCode: SETUP_CODE,
  }

  const started = Date.now()
  const slow = setTimeout(() => console.warn(`[api:${name}] still running after 15s (database not answering?)`), 15_000)
  try {
    const data = await dispatch(name, args, ctx)
    if (cookies.length) res.setHeader('Set-Cookie', cookies)
    sendJson(res, 200, { ok: true, data })
  } catch (err) {
    if (cookies.length) res.setHeader('Set-Cookie', cookies)
    if (err instanceof AuthError) return sendJson(res, err.status, { ok: false, error: err.message, status: err.status })
    console.error(`[api:${name}]`, err)
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
  } finally {
    clearTimeout(slow)
    const ms = Date.now() - started
    if (ms > 3000) console.warn(`[api:${name}] took ${ms} ms`)
  }
}
