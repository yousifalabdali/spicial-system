// Products, customers and suppliers.
import { getDb } from './index'
import type { Customer, PartyInput, Product, ProductInput, Supplier } from '../../shared/types'

const db = () => getDb()

export function listProducts(): Product[] {
  return db().prepare('SELECT * FROM products WHERE deleted = 0 ORDER BY name').all() as Product[]
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
  if (input.id) {
    const before = db().prepare('SELECT qty FROM products WHERE id = ?').get(input.id) as { qty: number }
    db().transaction(() => {
      db().prepare('UPDATE products SET name=@name, code=@code, category=@category, unit=@unit, cost=@cost, price=@price, qty=@qty, min_qty=@min_qty WHERE id=@id').run({ ...p, id: input.id })
      if (before && before.qty !== p.qty) {
        db().prepare("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'adjust')").run(input.id, p.qty - before.qty)
      }
    })()
    return db().prepare('SELECT * FROM products WHERE id = ?').get(input.id) as Product
  }
  const id = db().transaction(() => {
    const r = db().prepare('INSERT INTO products (name, code, category, unit, cost, price, qty, min_qty) VALUES (@name, @code, @category, @unit, @cost, @price, @qty, @min_qty)').run(p)
    if (p.qty) db().prepare("INSERT INTO stock_moves (product_id, change, reason) VALUES (?, ?, 'opening')").run(r.lastInsertRowid, p.qty)
    return r.lastInsertRowid
  })()
  return db().prepare('SELECT * FROM products WHERE id = ?').get(id) as Product
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
