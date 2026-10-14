// Database schema, connection and settings (Postgres: Supabase in production, PGlite locally).
import { connect, q, tx, SQL_NOW } from './sql'
import type { Settings } from '../../shared/types'

const NOW = `DEFAULT ${SQL_NOW}`

// Dates are local-time text ("YYYY-MM-DD HH:MM:SS") so they compare and print exactly like before.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    category TEXT,
    unit TEXT NOT NULL DEFAULT 'حبة',
    cost INTEGER NOT NULL DEFAULT 0,
    price INTEGER NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 0,
    min_qty INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS sales_invoices (
    id SERIAL PRIMARY KEY,
    number TEXT UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    customer_name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'retail',
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL DEFAULT 0,
    vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    vat INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    status TEXT NOT NULL,
    due_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sales_created ON sales_invoices(created_at)`,
  `CREATE TABLE IF NOT EXISTS sales_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
    product_id INTEGER REFERENCES products(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    total INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items(invoice_id)`,
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    number TEXT UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    status TEXT NOT NULL DEFAULT 'pending',
    total INTEGER NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    expected_date TEXT,
    received_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    total INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS treasury (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('in','out')),
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    ref TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_treasury_created ON treasury(created_at)`,
  `CREATE TABLE IF NOT EXISTS cheques (
    id SERIAL PRIMARY KEY,
    direction TEXT NOT NULL CHECK (direction IN ('in','out')),
    number TEXT NOT NULL,
    bank TEXT,
    party TEXT NOT NULL,
    amount INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS stock_moves (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    created_at TEXT NOT NULL ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin','admin','employee')),
    permissions TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL ${NOW},
    last_login TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username))`,
  // Website logins. Only a hash of the cookie token is stored.
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL ${NOW}
  )`,
  // Wrong-password counters, shared by every server instance.
  `CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    fails INTEGER NOT NULL DEFAULT 0,
    locked_until BIGINT NOT NULL DEFAULT 0
  )`,
]

const TABLES = ['settings', 'products', 'customers', 'suppliers', 'sales_invoices', 'sales_items', 'purchase_orders', 'purchase_items', 'treasury', 'cheques', 'stock_moves', 'users', 'sessions', 'login_attempts']

// Supabase also publishes the public schema through its REST API. Row level security with no policies
// closes that door; this server connects as the table owner, which RLS does not apply to.
const LOCKDOWN = [
  ...TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`),
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON ${TABLES.join(', ')} FROM anon, authenticated; END IF; END $$`,
]

export const DEFAULT_SETTINGS: Settings = {
  shop_name: 'Sales Inventory Pro',
  shop_phone: '',
  shop_address: '',
  vat_number: '',
  vat_enabled: true,
  vat_rate: 5,
  paper: '80mm',
  printer_name: '',
  silent_print: false,
  receipt_footer: 'شكراً لزيارتكم',
  label_size: '50x25',
  label_printer: '',
  label_show_shop: true,
  label_show_price: true,
  scan_auto_print: false,
  receipt_show_images: true,
}

let ready: Promise<void> | null = null

/** Connect and make sure the tables exist (once per process / serverless instance). */
export function openDb(opts: { url?: string; localDir?: string }) {
  ready ??= (async () => {
    await connect(opts)
    for (const stmt of [...SCHEMA, ...LOCKDOWN]) await q.raw(stmt)
  })().catch((e) => { ready = null; throw e })
  return ready
}

export async function getSettings(): Promise<Settings> {
  const rows = await q.all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'")
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  return { ...DEFAULT_SETTINGS, ...stored }
}

const UPSERT = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'

export async function saveSettings(patch: Partial<Settings>) {
  await tx(async () => {
    for (const [key, value] of Object.entries(patch)) {
      if (key in DEFAULT_SETTINGS) await q.run(UPSERT, key, JSON.stringify(value))
    }
  })
  return getSettings()
}

export async function getMeta(key: string): Promise<string | undefined> {
  return (await q.one<{ value: string }>('SELECT value FROM settings WHERE key = ?', `_${key}`))?.value
}

export async function setMeta(key: string, value: string) {
  await q.run(UPSERT, `_${key}`, value)
}

export const BUSINESS_TABLES = ['stock_moves', 'sales_items', 'sales_invoices', 'purchase_items', 'purchase_orders', 'treasury', 'cheques', 'products', 'customers', 'suppliers']

/** Wipe every business table (keeps settings and accounts). Used by "start fresh" in Settings. */
export async function resetData() {
  await tx(async () => {
    for (const t of BUSINESS_TABLES) await q.run(`DELETE FROM ${t}`)
  })
}

/** Current local date/time as stored in the tables. */
export async function nowLocal() {
  return (await q.one<{ t: string }>(`SELECT ${SQL_NOW} AS t`))!.t
}
