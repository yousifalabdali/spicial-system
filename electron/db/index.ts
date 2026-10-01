import Database from 'better-sqlite3'
import type { Settings } from '../../shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'حبة',
  cost INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'retail',
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 0,
  vat INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales_invoices(created_at);

CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  total INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_items(invoice_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  expected_date TEXT,
  received_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('in','out')),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_treasury_created ON treasury(created_at);

CREATE TABLE IF NOT EXISTS cheques (
  id INTEGER PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  number TEXT NOT NULL,
  bank TEXT,
  party TEXT NOT NULL,
  amount INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`

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
}

let db: Database.Database

export function openDb(file: string) {
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

export function getDb() {
  return db
}

export function getSettings(): Settings {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'").all() as { key: string; value: string }[]
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  return { ...DEFAULT_SETTINGS, ...stored }
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (key in DEFAULT_SETTINGS) stmt.run(key, JSON.stringify(value))
    }
  })()
  return getSettings()
}

export function getMeta(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`_${key}`) as { value: string } | undefined
  return row?.value
}

export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(`_${key}`, value)
}

/** Wipe every business table (keeps settings). Used by "start fresh" in Settings. */
export function resetData() {
  db.transaction(() => {
    for (const t of ['stock_moves', 'sales_items', 'sales_invoices', 'purchase_items', 'purchase_orders', 'treasury', 'cheques', 'products', 'customers', 'suppliers']) {
      db.exec(`DELETE FROM ${t}`)
    }
  })()
}

/** Current local date/time in SQLite's text format. */
export function nowLocal() {
  return (db.prepare("SELECT datetime('now','localtime') AS t").get() as { t: string }).t
}
