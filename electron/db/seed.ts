// Demo data inserted on first launch so the shop can try the system right away.
// It can be wiped from Settings ("start fresh").
import { getDb, getMeta, setMeta } from './index'
import { saveCustomer, saveProduct, saveSupplier } from './catalog'
import { createInvoice } from './sales'
import { createPurchase, receivePurchase } from './purchases'
import { addCheque, addTreasury } from './treasury'
import type { Channel } from '../../shared/types'

const r = (omr: number) => Math.round(omr * 1000)

export function seedIfEmpty() {
  if (getMeta('seeded')) return
  const db = getDb()
  const hasData = (db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }).c > 0
  setMeta('seeded', '1')
  if (hasData) return

  db.transaction(() => {
    const products = [
      ['أرز بسمتي 5 كجم', '6281001001', 'مواد غذائية', 'كيس', 2.1, 2.75, 120, 20],
      ['زيت دوار الشمس 1.8 لتر', '6281001002', 'مواد غذائية', 'علبة', 1.15, 1.5, 80, 15],
      ['سكر 2 كجم', '6281001003', 'مواد غذائية', 'كيس', 0.55, 0.75, 6, 20],
      ['حليب مجفف 900 جم', '6281001004', 'ألبان', 'علبة', 2.4, 3.1, 45, 10],
      ['شاي أحمر 100 كيس', '6281001005', 'مشروبات', 'علبة', 0.9, 1.25, 60, 10],
      ['قهوة عربية 250 جم', '6281001006', 'مشروبات', 'كيس', 1.8, 2.5, 4, 8],
      ['معكرونة 500 جم', '6281001007', 'مواد غذائية', 'كيس', 0.18, 0.3, 200, 30],
      ['مياه معدنية 12×330مل', '6281001008', 'مشروبات', 'كرتون', 0.65, 0.95, 150, 25],
      ['منظف أرضيات 3 لتر', '6281001009', 'منظفات', 'علبة', 0.85, 1.3, 3, 10],
      ['مناديل ورقية 5 حبات', '6281001010', 'منظفات', 'ربطة', 0.7, 1.1, 90, 15],
      ['تونة 185 جم', '6281001011', 'معلبات', 'علبة', 0.32, 0.5, 5, 24],
      ['عسل طبيعي 500 جم', '6281001012', 'مواد غذائية', 'علبة', 3.5, 4.9, 25, 5],
    ] as const
    const ids = products.map(([name, code, category, unit, cost, price, qty, min]) =>
      saveProduct({ name, code, category, unit, cost: r(cost), price: r(price), qty, min_qty: min }).id)

    const customers = ['مؤسسة الأفق', 'شركة اليسر', 'مؤسسة الثقة', 'محلات النور'].map((name, i) =>
      saveCustomer({ name, phone: `9${i + 1}234567`, address: 'مسقط', notes: null }))
    const suppliers = ['شركة الخليج للتوزيع', 'مؤسسة الوادي التجارية'].map((name, i) =>
      saveSupplier({ name, phone: `2${i + 4}456789`, address: 'صحار', notes: null }))

    const sales: { c: number | null; ch: Channel; items: [number, number][]; credit?: boolean }[] = [
      { c: null, ch: 'retail', items: [[0, 2], [1, 1]] },
      { c: customers[0], ch: 'wholesale', items: [[0, 10], [6, 30]] },
      { c: customers[1], ch: 'distribution', items: [[7, 20], [4, 6]], credit: true },
      { c: customers[2], ch: 'wholesale', items: [[3, 8], [11, 2]] },
      { c: null, ch: 'retail', items: [[9, 2], [10, 3], [2, 2]] },
      { c: null, ch: 'retail', items: [[5, 1], [4, 1]] },
      { c: customers[3], ch: 'distribution', items: [[1, 12]], credit: true },
      { c: null, ch: 'retail', items: [[7, 3], [6, 5]] },
    ]
    const lastHour = Math.max(9, new Date().getHours())
    const hours = sales.map((_, i) => 8 + Math.floor((i * (lastHour - 8)) / sales.length))
    sales.forEach((s, i) => {
      const inv = createInvoice({
        customer_id: s.c,
        channel: s.ch,
        items: s.items.map(([p, qty]) => ({ product_id: ids[p], qty, price: r(products[p][5]) })),
        discount: 0,
        paid: 0,
        payment_method: s.credit ? 'credit' : 'cash',
        due_date: null,
        notes: null,
      })
      // Spread demo sales across today's hours so the chart has a shape.
      const t = `${String(hours[i]).padStart(2, '0')}:${String(10 + i * 5).padStart(2, '0')}:00`
      db.prepare("UPDATE sales_invoices SET created_at = date('now','localtime') || ' ' || ? WHERE id = ?").run(t, inv.id)
      db.prepare("UPDATE treasury SET created_at = date('now','localtime') || ' ' || ? WHERE ref = ?").run(t, inv.number)
    })

    const po1 = createPurchase({ supplier_id: suppliers[0], items: [{ product_id: ids[2], qty: 50, cost: r(0.55) }, { product_id: ids[10], qty: 48, cost: r(0.32) }], expected_date: null, notes: null })
    db.prepare("UPDATE purchase_orders SET expected_date = date('now','localtime','-2 days') WHERE id = ?").run(po1.id)
    createPurchase({ supplier_id: suppliers[1], items: [{ product_id: ids[8], qty: 24, cost: r(0.85) }], expected_date: null, notes: null })
    const po3 = createPurchase({ supplier_id: suppliers[1], items: [{ product_id: ids[11], qty: 10, cost: r(3.5) }], expected_date: null, notes: null })
    receivePurchase(po3.id, r(20))

    addTreasury({ type: 'out', category: 'كهرباء', amount: r(18.5), description: 'فاتورة الكهرباء' })
    addTreasury({ type: 'out', category: 'نقل', amount: r(6), description: 'توصيل بضاعة' })
    addCheque({ direction: 'in', number: '100245', bank: 'بنك مسقط', party: 'مؤسسة الأفق', amount: r(150), due_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), notes: null })
  })()
}
