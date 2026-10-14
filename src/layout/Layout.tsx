import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, ShoppingCart, Package, Wallet, Truck, BarChart3, Settings, ScanBarcode, PanelRightClose, PanelRightOpen, Plus, ShieldCheck, LogOut } from 'lucide-react'
import { ScanDialog } from '../components/Barcode'
import { StockAlerts } from '../components/StockAlerts'
import { DesktopAutoBackup } from '../components/BackupPanel'
import { useLastScan } from '../lib/scanner'
import { useAuth } from '../lib/auth'
import { isDesktop } from '../lib/api'
import { ROLE_LABEL, type Permission } from '../../shared/auth'

export const NAV: { to: string; label: string; icon: typeof Home; perm?: Permission }[] = [
  { to: '/', label: 'الرئيسية', icon: Home, perm: 'dashboard' },
  { to: '/sales', label: 'المبيعات', icon: ShoppingCart, perm: 'sales' },
  { to: '/inventory', label: 'المخزون', icon: Package, perm: 'inventory' },
  { to: '/treasury', label: 'الخزينة', icon: Wallet, perm: 'treasury' },
  { to: '/suppliers', label: 'الموردين', icon: Truck, perm: 'suppliers' },
  { to: '/reports', label: 'التقارير', icon: BarChart3, perm: 'reports' },
  { to: '/settings', label: 'الإعدادات', icon: Settings, perm: 'settings' },
]
const ADMIN_LINK = { to: '/admin', label: 'لوحة التحكم', icon: ShieldCheck }

const DATE = new Intl.DateTimeFormat('ar-OM', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Shows that the scanner is listening, and flashes green with the code on every scan. */
function ScannerStatus() {
  const last = useLastScan()
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!last) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 1800)
    return () => clearTimeout(t)
  }, [last])
  return (
    <div title="وصّل قارئ الباركود بمنفذ USB وامسح أي منتج في أي شاشة"
      className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors ${flash ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-white text-muted'}`}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <ScanBarcode size={17} />
      {flash && last ? <span className="num font-mono">{last.code}</span> : <span>القارئ جاهز</span>}
    </div>
  )
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, can, isManager, logout } = useAuth()
  const links = [...NAV.filter((n) => !n.perm || can(n.perm)), ...(isManager ? [ADMIN_LINK] : [])]
  const current = links.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))

  return (
    <div className="flex h-full">
      <aside className={`flex shrink-0 flex-col border-l border-line bg-white transition-all ${collapsed ? 'w-[76px]' : 'w-60'}`}>
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <ScanBarcode size={22} />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight" dir="ltr">
              <div className="truncate font-bold">Sales Inventory</div>
              <div className="text-xs font-semibold text-accent">PRO</div>
            </div>
          )}
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
                  isActive ? 'bg-accent text-white shadow-md shadow-indigo-500/25' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                } ${collapsed ? 'justify-center' : ''}`}>
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className={`mx-3 mb-1 flex items-center gap-2.5 rounded-xl border border-line p-2 ${collapsed ? 'justify-center' : ''}`}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 font-bold text-accent">{user.name.slice(0, 1)}</div>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-bold">{user.name}</div>
                <div className="text-xs text-muted">{ROLE_LABEL[user.role]}{!isDesktop && ' · موقع'}</div>
              </div>
            )}
            {!collapsed && <button onClick={logout} title="تسجيل الخروج" className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"><LogOut size={17} /></button>}
          </div>
        )}

        <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'توسيع القائمة' : 'تصغير القائمة'}
          className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-xl py-2 text-sm text-muted transition hover:bg-slate-100 hover:text-ink">
          {collapsed ? <PanelRightOpen size={18} /> : <><PanelRightClose size={18} /> تصغير</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white/80 px-6 backdrop-blur">
          <div>
            <h1 className="text-lg leading-tight font-bold">{current?.label}</h1>
            <div className="text-xs text-muted">{DATE.format(new Date())}</div>
          </div>
          <div className="flex items-center gap-3">
            {(can('inventory') || can('dashboard') || can('sales') || can('suppliers')) && <StockAlerts />}
            <ScannerStatus />
            {can('sales') && <button onClick={() => navigate('/sales')}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-700">
              <Plus size={17} /> بيع جديد
            </button>}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {(can('inventory') || can('sales')) && <ScanDialog />}
      {isDesktop && <DesktopAutoBackup />}
    </div>
  )
}
