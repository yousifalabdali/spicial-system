// Backups as one JSON file: every business table plus the shop settings (accounts are not included).
// The website downloads it; the desktop app saves it to a folder on a schedule. Restore replaces all
// business data in one transaction, so a bad file changes nothing.
import { BUSINESS_TABLES, DEFAULT_SETTINGS } from './db'
import { q, tx, SQL_NOW } from './db/sql'

const APP_ID = 'sales-inventory-pro'
const VERSION = 1

// Columns restored per table (a whitelist: keys in the file never become SQL by themselves).
// Parents come before children so foreign keys are satisfied while inserting.
const COLUMNS: Record<string, string[]> = {
  products: ['id', 'name', 'code', 'category', 'unit', 'cost', 'price', 'qty', 'min_qty', 'deleted', 'image', 'created_at'],
  customers: ['id', 'name', 'phone', 'address', 'notes', 'created_at'],
  suppliers: ['id', 'name', 'phone', 'address', 'notes', 'created_at'],
  sales_invoices: ['id', 'number', 'customer_id', 'customer_name', 'channel', 'subtotal', 'discount', 'vat_rate', 'vat', 'total', 'paid', 'payment_method', 'status', 'due_date', 'notes', 'created_at'],
  sales_items: ['id', 'invoice_id', 'product_id', 'name', 'qty', 'price', 'cost', 'total'],
  purchase_orders: ['id', 'number', 'supplier_id', 'status', 'total', 'paid', 'expected_date', 'received_at', 'notes', 'created_at'],
  purchase_items: ['id', 'order_id', 'product_id', 'name', 'qty', 'cost', 'total'],
  treasury: ['id', 'type', 'category', 'amount', 'description', 'ref', 'created_at'],
  cheques: ['id', 'direction', 'number', 'bank', 'party', 'amount', 'due_date', 'status', 'notes', 'created_at'],
  stock_moves: ['id', 'product_id', 'change', 'reason', 'ref', 'created_at'],
}
const ORDER = Object.keys(COLUMNS)

export interface BackupFile {
  app: typeof APP_ID
  version: number
  exported_at: string
  settings: Record<string, unknown>
  tables: Record<string, Record<string, unknown>[]>
  counts: Record<string, number>
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {}
  for (const t of ORDER) tables[t] = await q.all(`SELECT ${COLUMNS[t].join(', ')} FROM ${t} ORDER BY id`)
  const rows = await q.all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\' LIMIT 200")
  const exportedAt = (await q.one<{ t: string }>(`SELECT ${SQL_NOW} AS t`))!.t
  return {
    app: APP_ID,
    version: VERSION,
    exported_at: exportedAt,
    settings: Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])),
    tables,
    counts: Object.fromEntries(ORDER.map((t) => [t, tables[t].length])),
  }
}

/** Replace all business data and shop settings with the backup's. Accounts are left untouched. */
export async function restoreBackup(data: BackupFile) {
  if (!data || data.app !== APP_ID || typeof data.tables !== 'object') throw new Error('هذا الملف ليس نسخة احتياطية من هذا النظام')
  if (data.version > VERSION) throw new Error('هذه النسخة من إصدار أحدث من النظام')

  await tx(async () => {
    for (const t of BUSINESS_TABLES) await q.run(`DELETE FROM ${t}`) // children first (BUSINESS_TABLES is ordered that way)
    for (const t of ORDER) {
      const rows = Array.isArray(data.tables[t]) ? data.tables[t] : []
      const cols = COLUMNS[t]
      // Insert in chunks to keep each statement a reasonable size.
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const params: unknown[] = []
        const values = chunk.map((r) => `(${cols.map((c) => { params.push(r[c] ?? null); return `$${params.length}` }).join(', ')})`)
        await q.raw(`INSERT INTO ${t} (${cols.join(', ')}) VALUES ${values.join(', ')}`, params)
      }
      // Next new id continues after the restored rows.
      await q.raw(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT MAX(id) FROM ${t}) IS NOT NULL)`)
    }
    for (const [key, value] of Object.entries(data.settings ?? {})) {
      if (key in DEFAULT_SETTINGS) await q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value))
    }
  })
  return Object.fromEntries(ORDER.map((t) => [t, Array.isArray(data.tables[t]) ? data.tables[t].length : 0]))
}
