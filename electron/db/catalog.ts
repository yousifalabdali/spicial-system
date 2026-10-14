// Products, customers and suppliers.
import { getDb } from './index'
import type { Customer, PartyInput, Product, ProductInput, Supplier } from '../../shared/types'

const db = () => getDb()

// Lists never carry the photo itself (it can be tens of KB): has_image says whether to fetch it.
const COLS = 'id, name, code, category, unit, cost, price, qty, min_qty, created_at, (image IS NOT NULL) AS has_image'
const MAX_IMAGE = 400_000 // characters of data URL (~300 KB of image)

export function listProducts(): Product[] {
  return db().prepare(`SELECT ${COLS} FROM products WHERE deleted = 0 ORDER BY name`).all() as Product[]
}

export function getProduct(id: number): Product {
  const p = db().prepare(`SELECT ${COLS} FROM products WHERE id = ?`).get(id) as Product | undefined
  if (!p) throw new Error('الصنف غير موجود')
  return p
}

export function getProductByCode(code: string): Product | null {
  return (db().prepare(`SELECT ${COLS} FROM products WHERE deleted = 0 AND code = ?`).get(code.trim()) as Product | undefined) ?? null
}

/** Products at or under their alert level, lowest first (for the bell and notifications). */
export function lowStockItems(): { id: number; name: string; qty: number; min_qty: number; unit: string }[] {
  return db().prepare('SELECT id, name, qty, min_qty, unit FROM products WHERE deleted = 0 AND qty <= min_qty ORDER BY qty - min_qty, name').all() as never
}

export function getProductImage(id: number): string | null {
  return (db().prepare('SELECT image FROM products WHERE id = ?').get(id) as { image: string | null } | undefined)?.image ?? null
}

/** Photos for a set of products (for printing an invoice). */
export function productImages(ids: (number | null)[]): Record<number, string> {
  const out: Record<number, string> = {}
  const get = db().prepare('SELECT image FROM products WHERE id = ? AND image IS NOT NULL')
  for (const id of new Set(ids)) {
    if (!id) continue
    const r = get.get(id) as { image: string } | undefined
    if (r) out[id] = r.image
  }
  return out
}

function checkImage(image: string | null | undefined) {
  if (image != null && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE)) {
    throw new Error('الصورة غير صالحة أو كبيرة جداً')
  }
}

function setImage(id: number, image: string | null) {
  db().prepare('UPDATE products SET image = ? WHERE id = ?').run(image, id)
}

function cleanProduct(p: ProductInput) {
  if (!p.name?.trim()) throw new Error('اسم الصنف مطلوب')
  return {
    name: p.name.trim(),
    code: p.code?.trim() || null,
    category: p.category?.trim() || null,
    unit: p.unit?.trim() || 'حبة',
    cost: Math.round(p.cost) || 0,
    price: Math.round(p.price) || 0,
    qty: Math.round(p.qty) || 0,
    min_qty: Math.round(p.min_qty) || 0,
  }
}

function assertCodeFree(code: string | null, exceptId = 0) {
  if (!code) return
  const row = db().prepare('SELECT id FROM products WHERE code = ? AND id != ?').get(code, exceptId)
  if (row) throw new Error('الكود مستخدم لصنف آخر')
}

export function saveProduct(input: ProductInput & { id?: number }): Product {
  const p = cleanProduct(input)
  assertCodeFree(p.code, input.id)
  checkImage(input.image)
  if (input.id) {
    const before = db().prepare('SELECT qty FROM products WHERE id = ?').get(input.id) as { qty: number }
    db().transaction(() => {
      db().prepare('UPDATE products SET name=@name, code=@code, category=@category, unit=@unit, cost=@cost, price=@price, qty=@qty, min_qty=@min_qty WHERE id=@id').run({ ...p, id: input.id })
      if (before && before.qty !== p.qty) {
        db().prepare("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'adjust')").run(input.id, p.qty - before.qty)
      }
    })()
    if (input.image !== undefined) setImage(input.id, input.image)
    return getProduct(input.id)
  }
  const id = db().transaction(() => {
    const r = db().prepare('INSERT INTO products (name, code, category, unit, cost, price, qty, min_qty) VALUES (@name, @code, @category, @unit, @cost, @price, @qty, @min_qty)').run(p)
    if (p.qty) db().prepare("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'opening')").run(r.lastInsertRowid, p.qty)
    return r.lastInsertRowid
  })()
  if (input.image) setImage(Number(id), input.image)
  return getProduct(Number(id))
}

export function deleteProduct(id: number) {
  // Soft delete: invoices keep referencing the product.
  db().prepare('UPDATE products SET deleted = 1, code = NULL WHERE id = ?').run(id)
}

export function listCustomers(): Customer[] {
  return db().prepare(`
    SELECT c.*, COALESCE((SELECT SUM(total - paid) FROM sales_invoices s WHERE s.customer_id = c.id AND s.status IN ('unpaid','partial')), 0) AS balance
    FROM customers c ORDER BY c.name`).all() as Customer[]
}

export function listSuppliers(): Supplier[] {
  return db().prepare(`
    SELECT s.*, COALESCE((SELECT SUM(total - paid) FROM purchase_orders p WHERE p.supplier_id = s.id AND p.status = 'received'), 0) AS balance
    FROM suppliers s ORDER BY s.name`).all() as Supplier[]
}

function saveParty(table: 'customers' | 'suppliers', input: PartyInput & { id?: number }) {
  if (!input.name?.trim()) throw new Error('الاسم مطلوب')
  const p = { name: input.name.trim(), phone: input.phone?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null }
  if (input.id) {
    db().prepare(`UPDATE ${table} SET name=@name, phone=@phone, address=@address, notes=@notes WHERE id=@id`).run({ ...p, id: input.id })
    return input.id
  }
  return Number(db().prepare(`INSERT INTO ${table} (name, phone, address, notes) VALUES (@name, @phone, @address, @notes)`).run(p).lastInsertRowid)
}

export const saveCustomer = (input: PartyInput & { id?: number }) => saveParty('customers', input)
export const saveSupplier = (input: PartyInput & { id?: number }) => saveParty('suppliers', input)

export function deleteCustomer(id: number) {
  const used = db().prepare('SELECT 1 FROM sales_invoices WHERE customer_id = ? LIMIT 1').get(id)
  if (used) throw new Error('لا يمكن حذف عميل لديه فواتير')
  db().prepare('DELETE FROM customers WHERE id = ?').run(id)
}

export function deleteSupplier(id: number) {
  const used = db().prepare('SELECT 1 FROM purchase_orders WHERE supplier_id = ? LIMIT 1').get(id)
  if (used) throw new Error('لا يمكن حذف مورد لديه أوامر شراء')
  db().prepare('DELETE FROM suppliers WHERE id = ?').run(id)
}
