// Products, customers and suppliers.
import { q, tx } from './sql'
import type { Customer, PartyInput, Product, ProductInput, Supplier } from '../../shared/types'

// Lists never carry the photo itself (it can be tens of KB): has_image says whether to fetch it.
const COLS = 'id, name, code, category, unit, cost, price, qty, min_qty, created_at, (image IS NOT NULL)::int AS has_image'
const MAX_IMAGE = 400_000 // characters of data URL (~300 KB of image)

export async function listProducts(): Promise<Product[]> {
  return q.all<Product>(`SELECT ${COLS} FROM products WHERE deleted = 0 ORDER BY name`)
}

export async function getProduct(id: number): Promise<Product> {
  const p = await q.one<Product>(`SELECT ${COLS} FROM products WHERE id = ?`, id)
  if (!p) throw new Error('الصنف غير موجود')
  return p
}

export async function getProductByCode(code: string): Promise<Product | null> {
  return (await q.one<Product>(`SELECT ${COLS} FROM products WHERE deleted = 0 AND code = ?`, String(code ?? '').trim())) ?? null
}

/** Products at or under their alert level, lowest first (for the bell and notifications). */
export async function lowStockItems(): Promise<{ id: number; name: string; qty: number; min_qty: number; unit: string }[]> {
  return q.all('SELECT id, name, qty, min_qty, unit FROM products WHERE deleted = 0 AND qty <= min_qty ORDER BY qty - min_qty, name')
}

export async function getProductImage(id: number): Promise<string | null> {
  return (await q.one<{ image: string | null }>('SELECT image FROM products WHERE id = ?', id))?.image ?? null
}

/** Photos for a set of products (for printing an invoice). */
export async function productImages(ids: (number | null)[]): Promise<Record<number, string>> {
  const wanted = [...new Set(ids.filter((id): id is number => !!id))]
  if (!wanted.length) return {}
  const rows = await q.all<{ id: number; image: string }>(`SELECT id, image FROM products WHERE image IS NOT NULL AND id IN (${wanted.map(() => '?').join(',')})`, ...wanted)
  return Object.fromEntries(rows.map((r) => [r.id, r.image]))
}

function checkImage(image: string | null | undefined) {
  if (image != null && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE)) {
    throw new Error('الصورة غير صالحة أو كبيرة جداً')
  }
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

async function assertCodeFree(code: string | null, exceptId = 0) {
  if (!code) return
  if (await q.one('SELECT id FROM products WHERE code = ? AND id != ?', code, exceptId)) throw new Error('الكود مستخدم لصنف آخر')
}

export async function saveProduct(input: ProductInput & { id?: number }): Promise<Product> {
  const p = cleanProduct(input)
  checkImage(input.image)
  const id = await tx(async () => {
    await assertCodeFree(p.code, input.id)
    if (input.id) {
      const before = await q.one<{ qty: number }>('SELECT qty FROM products WHERE id = ? FOR UPDATE', input.id)
      if (!before) throw new Error('الصنف غير موجود')
      await q.run('UPDATE products SET name = ?, code = ?, category = ?, unit = ?, cost = ?, price = ?, qty = ?, min_qty = ? WHERE id = ?',
        p.name, p.code, p.category, p.unit, p.cost, p.price, p.qty, p.min_qty, input.id)
      if (before.qty !== p.qty) await q.run("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'adjust')", input.id, p.qty - before.qty)
      if (input.image !== undefined) await q.run('UPDATE products SET image = ? WHERE id = ?', input.image, input.id)
      return input.id
    }
    const newId = await q.insert('INSERT INTO products (name, code, category, unit, cost, price, qty, min_qty, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.name, p.code, p.category, p.unit, p.cost, p.price, p.qty, p.min_qty, input.image || null)
    if (p.qty) await q.run("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'opening')", newId, p.qty)
    return newId
  })
  return getProduct(id)
}

export async function deleteProduct(id: number) {
  // Soft delete: invoices keep referencing the product.
  await q.run('UPDATE products SET deleted = 1, code = NULL WHERE id = ?', id)
}

export async function listCustomers(): Promise<Customer[]> {
  return q.all<Customer>(`
    SELECT c.*, COALESCE((SELECT SUM(total - paid) FROM sales_invoices s WHERE s.customer_id = c.id AND s.status IN ('unpaid','partial')), 0) AS balance
    FROM customers c ORDER BY c.name`)
}

export async function listSuppliers(): Promise<Supplier[]> {
  return q.all<Supplier>(`
    SELECT s.*, COALESCE((SELECT SUM(total - paid) FROM purchase_orders p WHERE p.supplier_id = s.id AND p.status = 'received'), 0) AS balance
    FROM suppliers s ORDER BY s.name`)
}

async function saveParty(table: 'customers' | 'suppliers', input: PartyInput & { id?: number }) {
  if (!input.name?.trim()) throw new Error('الاسم مطلوب')
  const p = [input.name.trim(), input.phone?.trim() || null, input.address?.trim() || null, input.notes?.trim() || null]
  if (input.id) {
    await q.run(`UPDATE ${table} SET name = ?, phone = ?, address = ?, notes = ? WHERE id = ?`, ...p, input.id)
    return input.id
  }
  return q.insert(`INSERT INTO ${table} (name, phone, address, notes) VALUES (?, ?, ?, ?)`, ...p)
}

export const saveCustomer = (input: PartyInput & { id?: number }) => saveParty('customers', input)
export const saveSupplier = (input: PartyInput & { id?: number }) => saveParty('suppliers', input)

export async function deleteCustomer(id: number) {
  if (await q.one('SELECT 1 FROM sales_invoices WHERE customer_id = ? LIMIT 1', id)) throw new Error('لا يمكن حذف عميل لديه فواتير')
  await q.run('DELETE FROM customers WHERE id = ?', id)
}

export async function deleteSupplier(id: number) {
  if (await q.one('SELECT 1 FROM purchase_orders WHERE supplier_id = ? LIMIT 1', id)) throw new Error('لا يمكن حذف مورد لديه أوامر شراء')
  await q.run('DELETE FROM suppliers WHERE id = ?', id)
}
