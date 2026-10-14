// Postgres access for the server. Two drivers behind the same tiny API:
//   DATABASE_URL set  -> postgres.js (Supabase in production; use the pooler URL on Vercel)
//   DATABASE_URL unset -> PGlite, a real Postgres running in-process (local runs and tests, no account needed)
// Queries use "?" placeholders; transactions follow the code through awaits (AsyncLocalStorage),
// so a helper called inside tx() automatically runs in that transaction.
import { AsyncLocalStorage } from 'node:async_hooks'

type Row = Record<string, unknown>
type Exec = (text: string, params: unknown[]) => Promise<Row[]>
interface Driver {
  exec: Exec
  transaction<T>(fn: (exec: Exec) => Promise<T>): Promise<T>
}

// COUNT/SUM come back as int8/numeric, which drivers return as strings. Money here is integer baisa,
// far below 2^53, so plain numbers are safe and are what the UI expects.
const INT8 = 20, NUMERIC = 1700
const toNumber = (v: string) => Number(v)

/** Local time zone for the shop: dates are stored as local "YYYY-MM-DD HH:MM:SS" text. */
export const TZ = /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(process.env.APP_TIMEZONE ?? '') ? process.env.APP_TIMEZONE! : 'Asia/Muscat'
export const SQL_NOW = `to_char(now() AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS')`
export const SQL_TODAY = `to_char(now() AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`
/** Local date `days` from today, e.g. sqlDay(7) for "within a week". */
export const sqlDay = (days: number) => `to_char((now() AT TIME ZONE '${TZ}') + interval '${Math.trunc(days)} days', 'YYYY-MM-DD')`

let driver: Driver | null = null
const txExec = new AsyncLocalStorage<Exec>()

async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url, {
    prepare: false, // required by Supabase's transaction pooler (port 6543)
    max: Number(process.env.DB_POOL_MAX) || 3,
    idle_timeout: 20,
    onnotice: () => {},
    types: {
      int8: { to: INT8, from: [INT8], parse: toNumber, serialize: String },
      numeric: { to: NUMERIC, from: [NUMERIC], parse: toNumber, serialize: String },
    },
  })
  const run = (s: { unsafe: typeof sql.unsafe }): Exec => async (text, params) => [...(await s.unsafe(text, params as never[]))] as Row[]
  return {
    exec: run(sql),
    transaction: (fn) => sql.begin((tx) => fn(run(tx as unknown as typeof sql))) as never,
  }
}

async function pgliteDriver(dir: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true }) // PGlite only creates the last folder
  const db = await PGlite.create(dir, { parsers: { [INT8]: toNumber, [NUMERIC]: toNumber } })
  type Q = { query: (t: string, p: unknown[]) => Promise<{ rows: unknown[] }> }
  const run = (q: Q): Exec => async (text, params) => (await q.query(text, params)).rows as Row[]
  return { exec: run(db), transaction: (fn) => db.transaction((tx) => fn(run(tx))) }
}

/** Connect once per process (and per serverless instance). */
export async function connect(opts: { url?: string; localDir?: string }) {
  if (driver) return
  if (opts.url) driver = await postgresDriver(opts.url)
  else if (opts.localDir) driver = await pgliteDriver(opts.localDir)
  else throw new Error('No database configured: set DATABASE_URL (Supabase) or run locally with DATA_DIR')
}

const current = (): Exec => {
  const e = txExec.getStore() ?? driver?.exec
  if (!e) throw new Error('Database not connected')
  return e
}

/** "?" placeholders -> $1, $2... (no query here puts a literal "?" inside a string). */
const numbered = (text: string) => { let i = 0; return text.replace(/\?/g, () => `$${++i}`) }

export const q = {
  all: async <T = Row>(text: string, ...params: unknown[]) => (await current()(numbered(text), params)) as T[],
  one: async <T = Row>(text: string, ...params: unknown[]) => ((await current()(numbered(text), params))[0] as T | undefined),
  run: async (text: string, ...params: unknown[]) => { await current()(numbered(text), params) },
  /** INSERT ... and get the new row's id. */
  insert: async (text: string, ...params: unknown[]) => Number((await current()(numbered(text) + ' RETURNING id', params))[0].id),
  /** Raw statement with $n placeholders already in place (schema, bulk restore). */
  raw: async (text: string, params: unknown[] = []) => current()(text, params),
}

/** Run fn in one transaction. Nested calls join the outer transaction. */
export function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txExec.getStore()) return fn()
  if (!driver) throw new Error('Database not connected')
  return driver.transaction((exec) => txExec.run(exec, fn))
}
