import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Wallet, PieChart as PieIcon, User, Package, Banknote, ShoppingCart, AlertTriangle, AlertCircle, Info, ChevronLeft, PackagePlus, Barcode, ScanBarcode, FileText, UserPlus, Truck, ClipboardList, Landmark, CreditCard, Settings, ShieldCheck, DatabaseBackup, PackageSearch, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { fmt, fmtShort } from '../lib/money'
import { CHANNEL_LABEL, INVOICE_STATUS } from '../lib/labels'
import { Money, Panel, StatCard, Table, TONE, type Tone } from '../components/ui'
import { useAuth } from '../lib/auth'
import { CustomizeHome, LowStockList, QuickProductSearch, useHomeLayout } from '../components/HomeWidgets'
import type { Permission } from '../../shared/auth'
import type { Channel } from '../../shared/types'

const CHANNEL_COLOR: Record<Channel, string> = { retail: '#6366f1', wholesale: '#14b8a6', distribution: '#f59e0b' }

export default function Dashboard() {
  const { data: d } = useLoad(() => api.dashboard())
  const navigate = useNavigate()
  const { can, isManager, user } = useAuth()
  const layout = useHomeLayout(user?.id)
  if (!d) return null

  const channelTotal = d.channels.reduce((s, c) => s + c.total, 0)
  const pie = (['retail', 'wholesale', 'distribution'] as Channel[]).map((ch) => {
    const total = d.channels.find((c) => c.channel === ch)?.total ?? 0
    return { ch, total, pct: channelTotal ? Math.round((total / channelTotal) * 100) : 0 }
  })

  const alerts: { label: string; count: number; icon: React.ReactNode; tone: Tone; to: string }[] = [
    { label: 'منتجات منخفضة المخزون', count: d.alerts.lowStock, icon: <AlertTriangle size={18} />, tone: 'amber', to: '/inventory?low=1' },
    { label: 'فواتير مستحقة الدفع', count: d.alerts.dueInvoices, icon: <AlertCircle size={18} />, tone: 'rose', to: '/sales?tab=invoices&status=due' },
    { label: 'أوامر شراء متأخرة', count: d.alerts.latePurchases, icon: <AlertCircle size={18} />, tone: 'rose', to: '/suppliers?tab=orders' },
    { label: 'شيكات قريبة من الاستحقاق', count: d.alerts.dueCheques, icon: <Info size={18} />, tone: 'sky', to: '/treasury?tab=cheques' },
  ]

  const quick: { label: string; hint: string; icon: React.ReactNode; to: string; cls: string; perm: Permission }[] = [
    { label: 'بيع جديد', hint: 'افتح نقطة البيع', icon: <ShoppingCart size={22} />, to: '/sales', perm: 'sales', cls: 'from-indigo-500 to-violet-600 shadow-indigo-500/30' },
    { label: 'صنف جديد', hint: 'أضف منتجاً للمخزون', icon: <PackagePlus size={22} />, to: '/inventory?new=', perm: 'inventory', cls: 'from-teal-500 to-emerald-600 shadow-emerald-500/30' },
    { label: 'ملصقات الباركود', hint: 'اطبع ملصقات الأصناف', icon: <Barcode size={22} />, to: '/inventory', perm: 'inventory', cls: 'from-amber-500 to-orange-500 shadow-amber-500/30' },
    { label: 'التقارير', hint: 'المبيعات والأرباح', icon: <BarChart3 size={22} />, to: '/reports', perm: 'reports', cls: 'from-sky-500 to-blue-600 shadow-sky-500/30' },
  ]

  // Every screen and common task, one click from home. Only what this account may open is shown.
  const controls: { label: string; icon: React.ReactNode; to: string; tone: Tone; show: boolean }[] = [
    { label: 'الفواتير', icon: <FileText size={20} />, to: '/sales?tab=invoices', tone: 'indigo', show: can('sales') },
    { label: 'فواتير مستحقة', icon: <AlertCircle size={20} />, to: '/sales?tab=invoices&status=due', tone: 'rose', show: can('sales') },
    { label: 'العملاء', icon: <UserPlus size={20} />, to: '/sales?tab=customers', tone: 'sky', show: can('sales') },
    { label: 'المخزون', icon: <PackageSearch size={20} />, to: '/inventory', tone: 'teal', show: can('inventory') },
    { label: 'نواقص المخزون', icon: <AlertTriangle size={20} />, to: '/inventory?low=1', tone: 'amber', show: can('inventory') },
    { label: 'الموردين', icon: <Truck size={20} />, to: '/suppliers', tone: 'violet', show: can('suppliers') },
    { label: 'أوامر الشراء', icon: <ClipboardList size={20} />, to: '/suppliers?tab=orders', tone: 'slate', show: can('suppliers') },
    { label: 'الخزينة', icon: <Landmark size={20} />, to: '/treasury', tone: 'emerald', show: can('treasury') },
    { label: 'الشيكات', icon: <CreditCard size={20} />, to: '/treasury?tab=cheques', tone: 'sky', show: can('treasury') },
    { label: 'الإعدادات', icon: <Settings size={20} />, to: '/settings', tone: 'slate', show: can('settings') },
    { label: 'المستخدمين والصلاحيات', icon: <ShieldCheck size={20} />, to: '/admin', tone: 'indigo', show: isManager },
    { label: 'النسخ الاحتياطي', icon: <DatabaseBackup size={20} />, to: '/admin', tone: 'teal', show: isManager },
  ]

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="-mb-2 flex justify-end"><CustomizeHome layout={layout} /></div>
      {layout.show('quick') && <div className="grid grid-cols-4 gap-4">
        {quick.filter((q) => can(q.perm)).map((q) => (
          <button key={q.label} onClick={() => navigate(q.to)}
            className={`flex items-center gap-3 rounded-2xl bg-gradient-to-br p-4 text-right text-white shadow-lg transition hover:-translate-y-0.5 ${q.cls}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">{q.icon}</span>
            <span>
              <span className="block font-bold">{q.label}</span>
              <span className="block text-xs text-white/80">{q.hint}</span>
            </span>
          </button>
        ))}
      </div>}

      {layout.show('controls') && controls.some((c) => c.show) && (
        <Panel title="لوحة التحكم">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {controls.filter((c) => c.show).map((c) => (
              <button key={c.label} onClick={() => navigate(c.to)}
                className="flex flex-col items-center gap-2 rounded-xl border border-line px-2 py-3 text-center text-sm font-semibold transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50/40">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${TONE[c.tone]}`}>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
          {can('sales') && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <MessageCircle size={14} className="text-emerald-600" /> عند البيع تُرسل الفاتورة لواتساب العميل تلقائياً إذا كُتب رقمه في شاشة البيع.
            </p>
          )}
        </Panel>
      )}

      {(layout.show('search') || layout.show('lowStock')) && (can('sales') || can('inventory')) && (
        <div className="grid grid-cols-[1.45fr_1fr] gap-5">
          {layout.show('search') && <QuickProductSearch canSell={can('sales')} canEdit={can('inventory')} />}
          {layout.show('lowStock') && <LowStockList canEdit={can('inventory')} />}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-2.5 text-sm text-indigo-700">
        <ScanBarcode size={18} className="shrink-0" />
        امسح أي منتج بقارئ الباركود من أي شاشة لعرضه وطباعة ملصقه. وفي شاشة البيع يُضاف للفاتورة مباشرة.
      </div>

      {layout.show('stats') && <>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="مبيعات الشهر" value={fmt(d.monthSales)} tone="indigo" icon={<BarChart3 size={24} />} onClick={() => navigate('/reports')} />
        <StatCard label="تحصيلات اليوم" value={fmt(d.todayCollections)} tone="emerald" icon={<Wallet size={24} />} onClick={() => navigate('/treasury')} />
        <StatCard label="مصروفات اليوم" value={fmt(d.todayExpenses)} tone="rose" icon={<Wallet size={24} />} onClick={() => navigate('/treasury')} />
        <StatCard label="ربح الشهر" value={fmt(d.monthProfit)} tone="violet" icon={<PieIcon size={24} />} onClick={() => navigate('/reports')} />
        <StatCard label="العملاء" value={d.customers} tone="sky" icon={<User size={24} />} onClick={() => navigate('/sales?tab=customers')} />
        <StatCard label="الأصناف" value={d.productCount} suffix="صنف" tone="amber" icon={<Package size={24} />} onClick={() => navigate('/inventory')} />
        <StatCard label="قيمة المخزون" value={fmt(d.stockValue)} tone="teal" icon={<Banknote size={24} />} onClick={() => navigate('/inventory')} />
        <StatCard label="أوامر شراء قيد الانتظار" value={d.pendingPurchases} suffix="طلب" tone="slate" icon={<ShoppingCart size={24} />} onClick={() => navigate('/suppliers?tab=orders')} />
      </div>
      <p className="-mt-3 text-xs text-muted">المبالغ بالريال العماني (ر.ع)</p>
      </>}

      {layout.show('latest') && <div className="grid grid-cols-[1.45fr_1fr] gap-5">
        <Panel title="آخر الفواتير" actions={<button className="flex items-center text-sm font-semibold text-accent hover:underline" onClick={() => navigate('/sales?tab=invoices')}>عرض الكل <ChevronLeft size={16} /></button>}>
          <Table head={['رقم الفاتورة', 'العميل', 'المبلغ', 'الحالة']} empty="لا توجد فواتير بعد">
            {d.latestInvoices.map((inv) => (
              <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/sales?tab=invoices&open=${inv.id}`)}>
                <td className="num text-right font-semibold">{inv.number}</td>
                <td>{inv.customer_name}</td>
                <td><Money v={inv.total} /></td>
                <td className={INVOICE_STATUS[inv.status].cls}>{INVOICE_STATUS[inv.status].label}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="تنبيهات النظام">
          <div className="flex flex-col gap-2">
            {alerts.map((a) => (
              <button key={a.label} onClick={() => navigate(a.to)}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-right transition hover:border-indigo-200 hover:bg-indigo-50/40">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TONE[a.tone]}`}>{a.icon}</span>
                <span className="flex-1 text-sm font-semibold">{a.label}</span>
                <span className={`num min-w-8 rounded-lg px-2 py-0.5 text-center font-bold ${a.count ? TONE[a.tone] : 'text-slate-300'}`}>{a.count}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>}

      {layout.show('charts') && <div className="grid grid-cols-[1.45fr_1fr] gap-5">
        <Panel title="حركة اليوم">
          <div className="h-56" dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={d.hourly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e4e8f1" vertical={false} />
                <XAxis dataKey="hour" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e4e8f1', borderRadius: 12, direction: 'rtl', boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)' }}
                  labelStyle={{ color: '#64748b' }}
                  formatter={(v) => [`${fmt(Number(v))} ر.ع`, 'المبيعات']}
                />
                <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5} fill="url(#area)"
                  dot={false} activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="توزيع المبيعات اليوم">
          <div className="flex h-56 items-center gap-6">
            <div className="h-48 w-48 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={channelTotal ? pie : [{ ch: 'retail', total: 1 }]} dataKey="total" innerRadius="60%" outerRadius="95%" stroke="#fff" strokeWidth={3} startAngle={90} endAngle={-270} isAnimationActive={false}>
                    {(channelTotal ? pie : [{ ch: 'none' }]).map((p) => <Cell key={p.ch} fill={channelTotal ? CHANNEL_COLOR[p.ch as Channel] : '#e4e8f1'} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-1 flex-col gap-4">
              {pie.map((p) => (
                <li key={p.ch} className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5 text-sm font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: CHANNEL_COLOR[p.ch] }} />
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
      </div>}
    </div>
  )
}
