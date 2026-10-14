// Purchase orders from suppliers. Receiving an order adds its items to stock.
import { nowLocal } from './index'
import { q, tx } from './sql'
import type { NewPurchaseOrder, Product, PurchaseItem, PurchaseOrder, PurchaseOrderWithItems } from '../../shared/types'

const SELECT = `SELECT p.*, s.name AS supplier_name FROM purchase_orders p JOIN suppliers s ON s.id = p.supplier_id`

export async function listPurchases(filter: { status?: string } = {}): Promise<PurchaseOrder[]> {
  if (filter.status) return q.all<PurchaseOrder>(`${SELECT} WHERE p.status = ? ORDER BY p.id DESC`, filter.status)
  return q.all<PurchaseOrder>(`${SELECT} ORDER BY p.id DESC LIMIT 500`)
}

export async function getPurchase(id: number): Promise<PurchaseOrderWithItems> {
  const po = await q.one<PurchaseOrder>(`${SELECT} WHERE p.id = ?`, id)
  if (!po) throw new Error('أمر الشراء غير موجود')
  const items = await q.all<PurchaseItem>('SELECT * FROM purchase_items WHERE order_id = ? ORDER BY id', id)
  return { ...po, items }
}

/** Lock the order row first (so two people can't receive or pay it at once), then read it. */
async function lockPurchase(id: number) {
  await q.one('SELECT id FROM purchase_orders WHERE id = ? FOR UPDATE', id)
  return getPurchase(id)
}

export async function createPurchase(input: NewPurchaseOrder): Promise<PurchaseOrderWithItems> {
  if (!input.items?.length) throw new Error('أمر الشراء فارغ')
  const id = await tx(async () => {
    const lines = []
    for (const i of input.items) {
      const p = await q.one<Product>('SELECT * FROM products WHERE id = ?', i.product_id)
      if (!p) throw new Error('صنف غير موجود')
      const qty = Math.round(i.qty)
      if (qty <= 0) throw new Error(`كمية غير صحيحة للصنف «${p.name}»`)
      const cost = Math.round(i.cost)
      lines.push({ p, qty, cost, total: qty * cost })
    }
    const total = lines.reduce((s, l) => s + l.total, 0)
    const orderId = await q.insert('INSERT INTO purchase_orders (supplier_id, total, expected_date, notes) VALUES (?, ?, ?, ?)', input.supplier_id, total, input.expected_date || null, input.notes || null)
    await q.run('UPDATE purchase_orders SET number = ? WHERE id = ?', `PO-${1000 + orderId}`, orderId)
    for (const l of lines) await q.run('INSERT INTO purchase_items (order_id, product_id, name, qty, cost, total) VALUES (?, ?, ?, ?, ?, ?)', orderId, l.p.id, l.p.name, l.qty, l.cost, l.total)
    return orderId
  })
  return getPurchase(id)
}

/** Mark an order received: stock goes up, product cost is updated, optional payment goes out of the treasury. */
export async function receivePurchase(id: number, paid: number) {
  await tx(async () => {
    const po = await lockPurchase(id)
    if (po.status !== 'pending') throw new Error('أمر الشراء ليس قيد الانتظار')
    const pay = Math.max(0, Math.min(Math.round(paid) || 0, po.total))
    for (const item of po.items) {
      await q.run('UPDATE products SET qty = qty + ?, cost = ? WHERE id = ?', item.qty, item.cost, item.product_id)
      await q.run("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'purchase', ?)", item.product_id, item.qty, po.number)
    }
    await q.run("UPDATE purchase_orders SET status = 'received', paid = ?, received_at = ? WHERE id = ?", pay, await nowLocal(), id)
    if (pay > 0) {
      await q.run("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'purchase', ?, ?, ?)", pay, `دفعة للمورد ${po.supplier_name} - ${po.number}`, po.number)
    }
  })
  return getPurchase(id)
}

export async function payPurchase(id: number, amount: number) {
  await tx(async () => {
    const po = await lockPurchase(id)
    if (po.status !== 'received') throw new Error('يجب استلام أمر الشراء أولاً')
    const pay = Math.min(Math.round(amount), po.total - po.paid)
    if (!(pay > 0)) throw new Error('المبلغ غير صحيح')
    await q.run('UPDATE purchase_orders SET paid = paid + ? WHERE id = ?', pay, id)
    await q.run("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'purchase', ?, ?, ?)", pay, `دفعة للمورد ${po.supplier_name} - ${po.number}`, po.number)
  })
  return getPurchase(id)
}

export async function cancelPurchase(id: number) {
  const po = await getPurchase(id)
  if (po.status !== 'pending') throw new Error('لا يمكن إلغاء أمر تم استلامه')
  await q.run("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'", id)
  return getPurchase(id)
}
