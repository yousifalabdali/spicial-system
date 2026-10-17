import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { monthStart, today, useLoad } from '../lib/hooks'
import { fmt, fmtShort, CURRENCY } from '../lib/money'
import { categoryLabel } from '../lib/labels'
import { Button, Field, Input, Money, PageTitle, Panel, Table, useAction } from '../components/ui'

const PRESETS = [
  { label: 'اليوم', range: () => ({ from: today(), to: today() }) },
  { label: 'آخر 7 أيام', range: () => ({ from: new Date(Date.now() - 6 * 864e5).toLocaleDateString('en-CA'), to: today() }) },
  { label: 'هذا الشهر', range: () => ({ from: monthStart(), to: today() }) },
  { label: 'هذه السنة', range: () => ({ from: today().slice(0, 4) + '-01-01', to: today() }) },
]

export default function Reports() {
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const { data: r } = useLoad(() => api.salesReport(range.from, range.to), [range.from, range.to])
  const products = useLoad(() => api.listProducts())
  const run = useAction()

  const exportSales = () => r && run(async () => {
    const rows: (string | number)[][] = [['التاريخ', 'المبيعات', 'الربح']]
    r.daily.forEach((d) => rows.push([d.day, fmt(d.total), fmt(d.profit)]))
    rows.push([], ['الصنف', 'الكمية', 'المبيعات'])
    r.topProducts.forEach((p) => rows.push([p.name, p.qty, fmt(p.total)]))
    return api.saveCsv(`تقرير-المبيعات-${range.from}-${range.to}.csv`, rows)
  })

  const exportStock = () => products.data && run(() => api.saveCsv(`تقرير-المخزون-${today()}.csv`, [
    ['الصنف', 'الكود', 'التصنيف', 'الكمية', 'سعر الشراء', 'سعر البيع', 'القيمة'],
    ...products.data!.map((p) => [p.name, p.code ?? '', p.category ?? '', p.qty, fmt(p.cost), fmt(p.price), fmt(p.qty * p.cost)]),
  ]))

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageTitle actions={<>
        <Button variant="ghost" onClick={exportSales}><Download size={16} /> تصدير المبيعات CSV</Button>
        <Button variant="ghost" onClick={() => window.print()}><Printer size={16} /> طباعة</Button>
      </>}>التقارير</PageTitle>

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end gap-2 pt-4">
          {PRESETS.map((p) => <Button key={p.label} variant="ghost" onClick={() => setRange(p.range())}>{p.label}</Button>)}
          <div className="flex-1" />
          <Field label="من تاريخ"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="إلى تاريخ"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
      </Panel>

      {r && <>
        <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Summary label="عدد الفواتير" value={<span className="num">{r.count}</span>} />
          <Summary label="صافي المبيعات (قبل الضريبة)" value={<Money v={r.subtotal - r.discount} />} />
          <Summary label="الضريبة المحصلة" value={<Money v={r.vat} />} />
          <Summary label="إجمالي المبيعات" value={<Money v={r.total} />} />
          <Summary label="إجمالي الربح" value={<Money v={r.profit} className="text-emerald-600" />} />
          <Summary label="المصروفات" value={<Money v={r.expenses} className="text-rose-600" />} />
          <Summary label="صافي الربح" value={<Money v={r.profit - r.expenses} className={r.profit - r.expenses >= 0 ? 'text-emerald-600' : 'text-rose-600'} />} />
          <Summary label="الخصومات" value={<Money v={r.discount} />} />
        </div>

        <Panel title="المبيعات اليومية" className="mb-4">
          <div className="h-64" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={r.daily} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#e4e8f1" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                <Tooltip cursor={{ fill: '#eef0ff' }} contentStyle={{ background: '#fff', border: '1px solid #e4e8f1', borderRadius: 12, direction: 'rtl', boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)' }}
                  formatter={(v, name) => [`${fmt(Number(v))} ${CURRENCY}`, name === 'total' ? 'المبيعات' : 'الربح']} />
                <Bar dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Panel title="الأصناف الأكثر مبيعاً">
            <Table head={['الصنف', 'الكمية', 'المبيعات']} empty="لا توجد مبيعات في هذه الفترة">
              {r.topProducts.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num text-right">{p.qty}</td><td><Money v={p.total} /></td></tr>)}
            </Table>
          </Panel>
          <Panel title="المصروفات حسب التصنيف">
            <Table head={['التصنيف', 'المبلغ']} empty="لا توجد مصروفات في هذه الفترة">
              {r.expensesByCategory.map((e) => <tr key={e.category}><td>{categoryLabel(e.category)}</td><td><Money v={e.total} /></td></tr>)}
            </Table>
          </Panel>
        </div>
      </>}

      <Panel title="تقرير المخزون" actions={<Button variant="ghost" onClick={exportStock}><Download size={16} /> تصدير CSV</Button>}>
        <Table head={['الصنف', 'التصنيف', 'الكمية', 'سعر الشراء', 'سعر البيع', 'القيمة']}>
          {products.data?.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.category}</td>
              <td className={`num text-right ${p.qty <= p.min_qty ? 'text-amber-600' : ''}`}>{p.qty}</td>
              <td><Money v={p.cost} /></td><td><Money v={p.price} /></td><td><Money v={p.qty * p.cost} /></td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 text-sm text-muted">إجمالي قيمة المخزون: <Money v={(products.data ?? []).reduce((s, p) => s + p.qty * p.cost, 0)} className="text-ink" /> {CURRENCY}</div>
      </Panel>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}
