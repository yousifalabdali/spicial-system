// Sales invoices: creating a sale moves stock and money in one transaction.
import { getSettings } from './index'
import { q, tx } from './sql'
import type { Invoice, InvoiceItem, InvoiceStatus, InvoiceWithItems, NewInvoice, Product } from '../../shared/types'

function statusFor(total: number, paid: number): InvoiceStatus {
  if (paid >= total) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}

export async function createInvoice(input: NewInvoice): Promise<InvoiceWithItems> {
  if (!input.items?.length) throw new Error('الفاتورة فارغة')
  const settings = await getSettings()
  const vatRate = settings.vat_enabled ? settings.vat_rate : 0

  const id = await tx(async () => {
    const lines = []
    for (const item of input.items) {
      // FOR UPDATE: two tills selling the last unit at the same moment can't both succeed.
      const p = await q.one<Product>('SELECT * FROM products WHERE id = ? AND deleted = 0 FOR UPDATE', item.product_id)
      if (!p) throw new Error('صنف غير موجود')
      const qty = Math.round(item.qty)
      if (qty <= 0) throw new Error(`كمية غير صحيحة للصنف «${p.name}»`)
      if (qty > p.qty) throw new Error(`الكمية المتوفرة من «${p.name}» هي ${p.qty} فقط`)
      const price = Math.round(item.price)
      lines.push({ product: p, qty, price, total: qty * price })
    }

    const subtotal = lines.reduce((s, l) => s + l.total, 0)
    const discount = Math.min(Math.max(Math.round(input.discount) || 0, 0), subtotal)
    const vat = Math.round(((subtotal - discount) * vatRate) / 100)
    const total = subtotal - discount + vat
    const paid = input.payment_method === 'credit' ? Math.max(0, Math.min(Math.round(input.paid) || 0, total)) : total

    let customerName = 'عميل نقدي'
    if (input.customer_id) {
      const c = await q.one<{ name: string }>('SELECT name FROM customers WHERE id = ?', input.customer_id)
      if (!c) throw new Error('العميل غير موجود')
      customerName = c.name
    }
    if (paid < total && !input.customer_id) throw new Error('البيع الآجل يتطلب اختيار عميل')

    const invoiceId = await q.insert(`
      INSERT INTO sales_invoices (customer_id, customer_name, channel, subtotal, discount, vat_rate, vat, total, paid, payment_method, status, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.customer_id || null, customerName, input.channel, subtotal, discount, vatRate, vat, total, paid,
      input.payment_method, statusFor(total, paid), input.due_date || null, input.notes || null)
    const number = `INV-${1000 + invoiceId}`
    await q.run('UPDATE sales_invoices SET number = ? WHERE id = ?', number, invoiceId)

    for (const l of lines) {
      await q.run('INSERT INTO sales_items (invoice_id, product_id, name, qty, price, cost, total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        invoiceId, l.product.id, l.product.name, l.qty, l.price, l.product.cost, l.total)
      await q.run('UPDATE products SET qty = qty - ? WHERE id = ?', l.qty, l.product.id)
      await q.run("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'sale', ?)", l.product.id, -l.qty, number)
    }
    if (paid > 0) {
      await q.run("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('in', 'sale', ?, ?, ?)", paid, `فاتورة مبيعات ${number}`, number)
    }
    return invoiceId
  })

  return getInvoice(id)
}

export async function getInvoice(id: number): Promise<InvoiceWithItems> {
  const inv = await q.one<Invoice & { customer_phone: string | null }>('SELECT i.*, c.phone AS customer_phone FROM sales_invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE i.id = ?', id)
  if (!inv) throw new Error('الفاتورة غير موجودة')
  const items = await q.all<InvoiceItem>('SELECT si.*, (p.image IS NOT NULL)::int AS has_image FROM sales_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.invoice_id = ? ORDER BY si.id', id)
  return { ...inv, items }
}

export async function listInvoices(filter: { from?: string; to?: string; search?: string; status?: string } = {}): Promise<Invoice[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.from) { where.push('substr(created_at, 1, 10) >= ?'); params.push(filter.from) }
  if (filter.to) { where.push('substr(created_at, 1, 10) <= ?'); params.push(filter.to) }
  if (filter.status === 'due') where.push("status IN ('unpaid','partial')")
  else if (filter.status) { where.push('status = ?'); params.push(filter.status) }
  if (filter.search) { where.push('(number ILIKE ? OR customer_name ILIKE ?)'); params.push(`%${filter.search}%`, `%${filter.search}%`) }
  return q.all<Invoice>(`SELECT * FROM sales_invoices ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`, ...params)
}

export async function payInvoice(id: number, amount: number) {
  await tx(async () => {
    const inv = await q.one<Invoice>('SELECT * FROM sales_invoices WHERE id = ? FOR UPDATE', id)
    if (!inv) throw new Error('الفاتورة غير موجودة')
    if (inv.status === 'cancelled') throw new Error('الفاتورة ملغاة')
    const pay = Math.min(Math.round(amount), inv.total - inv.paid)
    if (!(pay > 0)) throw new Error('المبلغ غير صحيح')
    const paid = inv.paid + pay
    await q.run('UPDATE sales_invoices SET paid = ?, status = ? WHERE id = ?', paid, statusFor(inv.total, paid), id)
    await q.run("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('in', 'collection', ?, ?, ?)", pay, `تحصيل من ${inv.customer_name} - ${inv.number}`, inv.number)
  })
  return getInvoice(id)
}

export async function cancelInvoice(id: number) {
  await tx(async () => {
    const inv = await q.one<Invoice>('SELECT * FROM sales_invoices WHERE id = ? FOR UPDATE', id)
    if (!inv) throw new Error('الفاتورة غير موجودة')
    if (inv.status === 'cancelled') return
    const items = await q.all<InvoiceItem>('SELECT * FROM sales_items WHERE invoice_id = ?', id)
    for (const item of items) {
      if (!item.product_id) continue
      await q.run('UPDATE products SET qty = qty + ? WHERE id = ?', item.qty, item.product_id)
      await q.run("INSERT INTO stock_moves (product_id, change, reason, ref) VALUES (?, ?, 'cancel', ?)", item.product_id, item.qty, inv.number)
    }
    if (inv.paid > 0) {
      await q.run("INSERT INTO treasury (type, category, amount, description, ref) VALUES ('out', 'refund', ?, ?, ?)", inv.paid, `إلغاء فاتورة ${inv.number}`, inv.number)
    }
    await q.run("UPDATE sales_invoices SET status = 'cancelled' WHERE id = ?", id)
  })
  return getInvoice(id)
}
