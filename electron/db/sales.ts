// Sales invoices: creating a sale moves stock and money in one transaction.
import { getDb, getSettings } from './index'
import type { Invoice, InvoiceItem, InvoiceStatus, InvoiceWithItems, NewInvoice, Product } from '../../shared/types'

const db = () => getDb()

function statusFor(total: number, paid: number): InvoiceStatus {
  if (paid >= total) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}

export function createInvoice(input: NewInvoice): InvoiceWithItems {
  if (!input.items.length) throw new Error('الفاتورة فارغة')
  const settings = getSettings()
  const vatRate = settings.vat_enabled ? settings.vat_rate : 0

  const id = db().transaction(() => {
    const getProduct = db().prepare('SELECT * FROM products WHERE id = ? AND deleted = 0')
    const lines = input.items.map((item) => {
      const p = getProduct.get(item.product_id) as Product | undefined
      if (!p) throw new Error('صنف غير موجود')
      const qty = Math.round(item.qty)
      if (qty <= 0) throw new Error(`كمية غير صحيحة للصنف «${p.name}»`)
      if (qty > p.qty) throw new Error(`الكمية المتوفرة من «${p.name}» هي ${p.qty} فقط`)
      const price = Math.round(item.price)
      return { product: p, qty, price, total: qty * price }
    })

    const subtotal = lines.reduce((s, l) => s + l.total, 0)
    const discount = Math.min(Math.max(Math.round(input.discount) || 0, 0), subtotal)
    const vat = Math.round(((subtotal - discount) * vatRate) / 100)
    const total = subtotal - discount + vat
    const paid = input.payment_method === 'credit' ? Math.max(0, Math.min(Math.round(input.paid) || 0, total)) : total

    let customerName = 'عميل نقدي'
    if (input.customer_id) {
      const c = db().prepare('SELECT name FROM customers WHERE id = ?').get(input.customer_id) as { name: string } | undefined
      if (!c) throw new Error('العميل غير موجود')
      customerName = c.name
    }
    if (paid < total && !input.customer_id) throw new Error('البيع الآجل يتطلب اختيار عميل')

    const r = db().prepare(`
      INSERT INTO sales_invoices (customer_id, customer_name, channel, subtotal, discount, vat_rate, vat, total, paid, payment_method, status, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.customer_id, customerName, input.channel, subtotal, discount, vatRate, vat, total, paid,
      input.payment_method, statusFor(total, paid), input.due_date || null, input.notes || null,
    )
    const invoiceId = Number(r.lastInsertRowid)
    const number = `INV-${1000 + invoiceId}`
    db().prepare('UPDATE sales_invoices SET number = ? WHERE id = ?').run(number, invoiceId)

    const insItem = db().prepare('INSERT INTO sales_items (invoice_id, product_id, name, qty, price, cost, total) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const decStock = db().prepare('UPDATE products SET qty = qty - ? WHERE id = ?')
    const move = db().prepare("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'sale', ?)")
    for (const l of lines) {
      insItem.run(invoiceId, l.product.id, l.product.name, l.qty, l.price, l.product.cost, l.total)
      decStock.run(l.qty, l.product.id)
      move.run(l.product.id, -l.qty, number)
    }
    if (paid > 0) {
      db().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('in', 'sale', ?, ?, ?)").run(paid, `فاتورة مبيعات ${number}`, number)
    }
    return invoiceId
  })()

  return getInvoice(id)
}

export function getInvoice(id: number): InvoiceWithItems {
  const inv = db().prepare('SELECT * FROM sales_invoices WHERE id = ?').get(id) as Invoice | undefined
  if (!inv) throw new Error('الفاتورة غير موجودة')
  const items = db().prepare('SELECT si.*, (p.image IS NOT NULL) AS has_image FROM sales_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.invoice_id = ? ORDER BY si.id').all(id) as InvoiceItem[]
  return { ...inv, items }
}

export function listInvoices(filter: { from?: string; to?: string; search?: string; status?: string } = {}): Invoice[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.from) { where.push('date(created_at) >= ?'); params.push(filter.from) }
  if (filter.to) { where.push('date(created_at) <= ?'); params.push(filter.to) }
  if (filter.status === 'due') where.push("status IN ('unpaid','partial')")
  else if (filter.status) { where.push('status = ?'); params.push(filter.status) }
  if (filter.search) { where.push('(number LIKE ? OR customer_name LIKE ?)'); params.push(`%${filter.search}%`, `%${filter.search}%`) }
  const sql = `SELECT * FROM sales_invoices ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`
  return db().prepare(sql).all(...params) as Invoice[]
}

export function payInvoice(id: number, amount: number) {
  const inv = getInvoice(id)
  if (inv.status === 'cancelled') throw new Error('الفاتورة ملغاة')
  const remaining = inv.total - inv.paid
  const pay = Math.min(Math.round(amount), remaining)
  if (pay <= 0) throw new Error('المبلغ غير صحيح')
  db().transaction(() => {
    const paid = inv.paid + pay
    db().prepare('UPDATE sales_invoices SET paid = ?, status = ? WHERE id = ?').run(paid, statusFor(inv.total, paid), id)
    db().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('in', 'collection', ?, ?, ?)").run(pay, `تحصيل من ${inv.customer_name} - ${inv.number}`, inv.number)
  })()
  return getInvoice(id)
}

export function cancelInvoice(id: number) {
  const inv = getInvoice(id)
  if (inv.status === 'cancelled') return inv
  db().transaction(() => {
    const incStock = db().prepare('UPDATE products SET qty = qty + ? WHERE id = ?')
    const move = db().prepare("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'cancel', ?)")
    for (const item of inv.items) {
      if (!item.product_id) continue
      incStock.run(item.qty, item.product_id)
      move.run(item.product_id, item.qty, inv.number)
    }
    if (inv.paid > 0) {
      db().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'refund', ?, ?, ?)").run(inv.paid, `إلغاء فاتورة ${inv.number}`, inv.number)
    }
    db().prepare("UPDATE sales_invoices SET status = 'cancelled' WHERE id = ?").run(id)
  })()
  return getInvoice(id)
}
