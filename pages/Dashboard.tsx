import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Wallet, PieChart as PieIcon, User, Package, Banknote, ShoppingCart, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { fmt, fmtShort } from '../lib/money'
import { CHANNEL_LABEL, INVOICE_STATUS } from '../lib/labels'
import { Money, Panel, StatCard, Table } from '../components/ui'
import type { Channel } from '../../shared/types'

const CHANNEL_COLOR: Record<Channel, string> = { retail: '#3b82f6', wholesale: '#2fa39a', distribution: '#8b5cf6' }

export default function Dashboard() {
  const { data: d } = useLoad(() => api.dashboard())
  const navigate = useNavigate()
  if (!d) return null

  const channelTotal = d.channels.reduce((s, c) => s + c.total, 0)
  const pie = (['retail', 'wholesale', 'distribution'] as Channel[]).map((ch) => {
    const total = d.channels.find((c) => c.channel === ch)?.total ?? 0
    return { ch, total, pct: channelTotal ? Math.round((total / channelTotal) * 100) : 0 }
  })

  const alerts = [
    { label: 'منتجات منخفضة المخزون', count: d.alerts.lowStock, icon: <AlertTriangle size={20} className="fill-amber-400 text-[#0e2149]" />, to: '/inventory?low=1' },
    { label: 'فواتير مستحقة الدفع', count: d.alerts.dueInvoices, icon: <AlertCircle size={20} className="fill-rose-500 text-white" />, to: '/sales?tab=invoices&status=due' },
    { label: 'أوامر شراء متأخرة', count: d.alerts.latePurchases, icon: <AlertCircle size={20} className="fill-rose-500 text-white" />, to: '/suppliers?tab=orders' },
    { label: 'شيكات قريبة من الاستحقاق', count: d.alerts.dueCheques, icon: <Info size={20} className="fill-blue-500 text-white" />, to: '/treasury?tab=cheques' },
  ]

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="إجمالي المبيعات" value={fmt(d.monthSales)} icon={<BarChart3 size={34} className="text-white" />} />
        <StatCard label="تحصيلات اليوم" value={fmt(d.todayCollections)} icon={<Wallet size={34} className="fill-emerald-500 text-emerald-200" />} />
        <StatCard label="مصروفات اليوم" value={fmt(d.todayExpenses)} icon={<Wallet size={34} className="fill-rose-500 text-rose-200" />} />
        <StatCard label="إجمالي الربح" value={fmt(d.monthProfit)} icon={<PieIcon size={34} className="fill-violet-500 text-violet-200" />} />
        <StatCard label="العملاء" value={d.customers} icon={<User size={34} className="fill-blue-500 text-blue-400" />} />
        <StatCard label="المخزون الكلي" value={d.productCount} suffix="صنف" icon={<Package size={34} className="fill-amber-400 text-amber-200" />} />
        <StatCard label="قيمة المخزون" value={fmt(d.stockValue)} icon={<Banknote size={34} className="fill-emerald-600 text-emerald-200" />} />
        <StatCard label="أوامر الشراء" value={d.pendingPurchases} suffix="طلب" icon={<ShoppingCart size={34} className="text-white" />} />
      </div>
      <p className="-mt-2 text-xs text-muted">إجمالي المبيعات والربح للشهر الحالي · المبالغ بالريال العماني (ر.ع)</p>

      <div className="grid grid-cols-[1.45fr_1fr] gap-4">
        <Panel title="آخر الفواتير">
          <Table head={['رقم الفاتورة', 'العميل', 'المبلغ', 'الحالة']} empty="لا توجد فواتير بعد">
            {d.latestInvoices.map((inv) => (
              <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/sales?tab=invoices&open=${inv.id}`)}>
                <td className="num text-right">{inv.number}</td>
                <td>{inv.customer_name}</td>
                <td><Money v={inv.total} /></td>
                <td className={INVOICE_STATUS[inv.status].cls}>{INVOICE_STATUS[inv.status].label}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="تنبيهات النظام">
          <Table head={['التنبيه', 'العدد']}>
            {alerts.map((a) => (
              <tr key={a.label} className="cursor-pointer" onClick={() => navigate(a.to)}>
                <td><span className="flex items-center gap-2.5">{a.icon}{a.label}</span></td>
                <td className={`num w-16 text-right font-bold ${a.count ? '' : 'text-muted'}`}>{a.count}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <div className="grid grid-cols-[1.45fr_1fr] gap-4">
        <Panel title="حركة اليوم">
          <div className="h-56" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={d.hourly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#22407a" strokeOpacity={0.6} vertical={false} />
                <XAxis dataKey="hour" stroke="#8fa3c7" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                <YAxis stroke="#8fa3c7" fontSize={12} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                <Tooltip
                  contentStyle={{ background: '#132a5a', border: '1px solid #22407a', borderRadius: 8, direction: 'rtl' }}
                  labelStyle={{ color: '#8fa3c7' }}
                  formatter={(v) => [`${fmt(Number(v))} ر.ع`, 'المبيعات']}
                />
                <Area type="linear" dataKey="total" stroke="#60a5fa" strokeWidth={2.5} fill="url(#area)"
                  dot={{ r: 3.5, fill: '#93c5fd', stroke: '#93c5fd' }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="توزيع المبيعات اليوم">
          <div className="flex h-56 items-center gap-6">
            <div className="h-48 w-48 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={channelTotal ? pie : [{ ch: 'retail', total: 1 }]} dataKey="total" innerRadius="52%" outerRadius="95%" stroke="#0e2149" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
                    {(channelTotal ? pie : [{ ch: 'none' }]).map((p) => <Cell key={p.ch} fill={channelTotal ? CHANNEL_COLOR[p.ch as Channel] : '#22407a'} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-1 flex-col gap-4">
              {pie.map((p) => (
                <li key={p.ch} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5">
                    <span className="h-4 w-4 rounded-sm" style={{ background: CHANNEL_COLOR[p.ch] }} />
                    {CHANNEL_LABEL[p.ch]}
                  </span>
                  <span className="text-left">
                    <span className="num font-bold">{p.pct}%</span>
                    <span className="num block text-xs text-muted">{fmt(p.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  )
}
