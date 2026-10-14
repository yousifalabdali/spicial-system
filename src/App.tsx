import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import Layout, { NAV } from './layout/Layout'
import { ToastProvider } from './components/ui'
import { ScannerProvider } from './lib/scanner'
import { AuthProvider, useAuth } from './lib/auth'
import type { Permission } from '../shared/auth'
import { LoginPage } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sales from './pages/Sales'
import Inventory from './pages/Inventory'
import Treasury from './pages/Treasury'
import Suppliers from './pages/Suppliers'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import AdminPage from './pages/Admin'

function NoAccess() {
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500"><ShieldOff size={28} /></div>
        <p className="mt-3 font-bold">لا تملك صلاحية لهذه الصفحة</p>
        <p className="mt-1 text-sm text-muted">اطلب من السوبر أدمن منحك الصلاحية.</p>
      </div>
    </div>
  )
}

/** A page that needs a permission (or, for the control panel, an admin role). */
function Guard({ perm, managers, children }: { perm?: Permission; managers?: boolean; children: ReactNode }) {
  const { can, isManager } = useAuth()
  const ok = managers ? isManager : perm ? can(perm) : true
  return ok ? <>{children}</> : <NoAccess />
}

/** The home page, or the first page this user may open. */
function Home() {
  const { can, isManager } = useAuth()
  if (can('dashboard')) return <Dashboard />
  const first = NAV.find((n) => n.perm && can(n.perm))
  if (first) return <Navigate to={first.to} replace />
  return isManager ? <Navigate to="/admin" replace /> : <NoAccess />
}

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') return null
  if (status !== 'ready') return <LoginPage />
  return (
    <ScannerProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="sales" element={<Guard perm="sales"><Sales /></Guard>} />
            <Route path="inventory" element={<Guard perm="inventory"><Inventory /></Guard>} />
            <Route path="treasury" element={<Guard perm="treasury"><Treasury /></Guard>} />
            <Route path="suppliers" element={<Guard perm="suppliers"><Suppliers /></Guard>} />
            <Route path="reports" element={<Guard perm="reports"><Reports /></Guard>} />
            <Route path="settings" element={<Guard perm="settings"><SettingsPage /></Guard>} />
            <Route path="admin" element={<Guard managers><AdminPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ScannerProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  )
}
