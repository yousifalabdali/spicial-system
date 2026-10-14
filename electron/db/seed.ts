// Demo data inserted on first launch so the shop can try the system right away.
// It can be wiped from Settings ("start fresh").
import { getMeta, setMeta } from './index'
import { q, tx, SQL_TODAY, sqlDay } from './sql'
import { saveCustomer, saveProduct, saveSupplier } from './catalog'
import { createInvoice } from './sales'
import { createPurchase, receivePurchase } from './purchases'
import { addCheque, addTreasury } from './treasury'
import type { Channel } from '../../shared/types'

const r = (omr: number) => Math.round(omr * 1000)

export async function seedIfEmpty() {
  if (await getMeta('seeded')) return
  const hasData = (await q.one<{ c: number }>('SELECT COUNT(*) AS c FROM products'))!.c > 0
  await setMeta('seeded', '1')
  if (hasData) return

  await tx(async () => {
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
    const ids: number[] = []
    for (const [name, code, category, unit, cost, price, qty, min] of products) {
      ids.push((await saveProduct({ name, code, category, unit, cost: r(cost), price: r(price), qty, min_qty: min })).id)
    }

    const customers: number[] = []
    for (const [i, name] of ['مؤسسة الأفق', 'شركة اليسر', 'مؤسسة الثقة', 'محلات النور'].entries()) {
      customers.push(await saveCustomer({ name, phone: `9${i + 1}234567`, address: 'مسقط', notes: null }))
    }
    const suppliers: number[] = []
    for (const [i, name] of ['شركة الخليج للتوزيع', 'مؤسسة الوادي التجارية'].entries()) {
      suppliers.push(await saveSupplier({ name, phone: `2${i + 4}456789`, address: 'صحار', notes: null }))
    }

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
    for (const [i, s] of sales.entries()) {
      const inv = await createInvoice({
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
      await q.run(`UPDATE sales_invoices SET created_at = ${SQL_TODAY} || ' ' || ? WHERE id = ?`, t, inv.id)
      await q.run(`UPDATE treasury SET created_at = ${SQL_TODAY} || ' ' || ? WHERE ref = ?`, t, inv.number)
    }

    const po1 = await createPurchase({ supplier_id: suppliers[0], items: [{ product_id: ids[2], qty: 50, cost: r(0.55) }, { product_id: ids[10], qty: 48, cost: r(0.32) }], expected_date: null, notes: null })
    await q.run(`UPDATE purchase_orders SET expected_date = ${sqlDay(-2)} WHERE id = ?`, po1.id)
    await createPurchase({ supplier_id: suppliers[1], items: [{ product_id: ids[8], qty: 24, cost: r(0.85) }], expected_date: null, notes: null })
    const po3 = await createPurchase({ supplier_id: suppliers[1], items: [{ product_id: ids[11], qty: 10, cost: r(3.5) }], expected_date: null, notes: null })
    await receivePurchase(po3.id, r(20))

    await addTreasury({ type: 'out', category: 'كهرباء', amount: r(18.5), description: 'فاتورة الكهرباء' })
    await addTreasury({ type: 'out', category: 'نقل', amount: r(6), description: 'توصيل بضاعة' })
    await addCheque({ direction: 'in', number: '100245', bank: 'بنك مسقط', party: 'مؤسسة الأفق', amount: r(150), due_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), notes: null })
  })
}
