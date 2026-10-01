import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Home, ShoppingCart, Package, Wallet, Truck, BarChart3, Settings, UserCircle2 } from 'lucide-react'

export const NAV = [
  { to: '/', label: 'الرئيسية', icon: Home },
  { to: '/sales', label: 'المبيعات', icon: ShoppingCart },
  { to: '/inventory', label: 'المخزون', icon: Package },
  { to: '/treasury', label: 'الخزينة', icon: Wallet },
  { to: '/suppliers', label: 'الموردين', icon: Truck },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-[#0c1b3d] px-5">
        <div className="flex items-center gap-4">
          <UserCircle2 size={26} className="text-ink/90" />
          <button onClick={() => navigate('/')} title="الرئيسية" className="text-ink/90 hover:text-white"><Home size={22} /></button>
          <span className="font-semibold">{current?.label}</span>
        </div>
        <div className="flex items-center gap-3" dir="ltr">
          <button onClick={() => setCollapsed((c) => !c)} title="القائمة" className="text-ink/90 hover:text-white"><Menu size={22} /></button>
          <span className="font-semibold tracking-tight">Sales Inventory Pro</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className={`shrink-0 border-l border-line bg-[#0c1b3d] py-4 transition-all ${collapsed ? 'w-[68px]' : 'w-48'}`}>
          <nav className="flex flex-col gap-1.5 px-2.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} title={label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'border border-accent/70 bg-accent/25 text-white shadow-[inset_-3px_0_0_var(--color-accent)]' : 'border border-transparent text-ink/85 hover:bg-panel'
                  }`}>
                <Icon size={19} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
