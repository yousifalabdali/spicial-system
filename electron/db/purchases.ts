// Purchase orders from suppliers. Receiving an order adds its items to stock.
import { getDb, nowLocal } from './index'
import type { NewPurchaseOrder, Product, PurchaseItem, PurchaseOrder, PurchaseOrderWithItems } from '../../shared/types'

const db = () => getDb()

const SELECT = `SELECT p.*, s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id`

export function listPurchases(filter: { status?: string } = {}): PurchaseOrder[] {
  if (filter.status) return db().prepare(`${SELECT} WHERE p.status = ? ORDER BY p.id DESC`).all(filter.status) as PurchaseOrder[]
  return db().prepare(`${SELECT} ORDER BY p.id DESC LIMIT 500`).all() as PurchaseOrder[]
}

export function getPurchase(id: number): PurchaseOrderWithItems {
  const po = db().prepare(`${SELECT} WHERE p.id = ?`).get(id) as PurchaseOrder | undefined
  if (!po) throw new Error('أمر الشراء غير موجود')
  const items = db().prepare('SELECT * FROM purchase_items WHERE order_id = ? ORDER BY id').all(id) as PurchaseItem[]
  return { ...po, items }
}

export function createPurchase(input: NewPurchaseOrder): PurchaseOrderWithItems {
  if (!input.items.length) throw new Error('أمر الشراء فارغ')
  const id = db().transaction(() => {
    const getProduct = db().prepare('SELECT * FROM products WHERE id = ?')
    const lines = input.items.map((i) => {
      const p = getProduct.get(i.product_id) as Product | undefined
      if (!p) throw new Error('صنف غير موجود')
      const qty = Math.round(i.qty)
      if (qty <= 0) throw new Error(`كمية غير صحيحة للصنف «${p.name}»`)
      const cost = Math.round(i.cost)
      return { p, qty, cost, total: qty * cost }
    })
    const total = lines.reduce((s, l) => s + l.total, 0)
    const r = db().prepare('INSERT INTO purchase_orders (supplier_id, total, expected_date, notes) VALUES (?, ?, ?, ?)').run(input.supplier_id, total, input.expected_date || null, input.notes || null)
    const orderId = Number(r.lastInsertRowid)
    db().prepare('UPDATE purchase_orders SET number = ? WHERE id = ?').run(`PO-${1000 + orderId}`, orderId)
    const ins = db().prepare('INSERT INTO purchase_items (order_id, product_id, name, qty, cost, total) VALUES (?, ?, ?, ?, ?, ?)')
    for (const l of lines) ins.run(orderId, l.p.id, l.p.name, l.qty, l.cost, l.total)
    return orderId
  })()
  return getPurchase(id)
}

/** Mark an order received: stock goes up, product cost is updated, optional payment goes out of the treasury. */
export function receivePurchase(id: number, paid: number) {
  const po = getPurchase(id)
  if (po.status !== 'pending') throw new Error('أمر الشراء ليس قيد الانتظار')
  const pay = Math.max(0, Math.min(Math.round(paid) || 0, po.total))
  db().transaction(() => {
    const upd = db().prepare('UPDATE products SET qty = qty + ?, cost = ? WHERE id = ?')
    const move = db().prepare("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'purchase', ?)")
    for (const item of po.items) {
      upd.run(item.qty, item.cost, item.product_id)
      move.run(item.product_id, item.qty, po.number)
    }
    db().prepare("UPDATE purchase_orders SET status = 'received', paid = ?, received_at = ? WHERE id = ?").run(pay, nowLocal(), id)
    if (pay > 0) {
      db().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'purchase', ?, ?, ?)").run(pay, `دفعة للمورد ${po.supplier_name} - ${po.number}`, po.number)
    }
  })()
  return getPurchase(id)
}

export function payPurchase(id: number, amount: number) {
  const po = getPurchase(id)
  if (po.status !== 'received') throw new Error('يجب استلام أمر الشراء أولاً')
  const pay = Math.min(Math.round(amount), po.total - po.paid)
  if (pay <= 0) throw new Error('المبلغ غير صحيح')
  db().transaction(() => {
    db().prepare('UPDATE purchase_orders SET paid = paid + ? WHERE id = ?').run(pay, id)
    db().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'purchase', ?, ?, ?)").run(pay, `دفعة للمورد ${po.supplier_name} - ${po.number}`, po.number)
  })()
  return getPurchase(id)
}

export function cancelPurchase(id: number) {
  const po = getPurchase(id)
  if (po.status !== 'pending') throw new Error('لا يمكن إلغاء أمر تم استلامه')
  db().prepare("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?").run(id)
  return getPurchase(id)
}
