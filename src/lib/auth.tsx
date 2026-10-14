// Who is logged in, and what they may do. The server enforces the same rules (electron/api.ts);
// this only decides what the UI shows.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, SESSION_LOST } from './api'
import { can as canDo, canManageUsers, type Permission, type User } from '../../shared/auth'

type Status = 'loading' | 'setup' | 'login' | 'ready' | 'offline'

interface AuthState {
  status: Status
  user: User | null
  setupCodeRequired: boolean
  offlineReason: string
  can: (perm: Permission) => boolean
  isManager: boolean
  refresh: () => Promise<void>
  signedIn: (user: User) => void
  logout: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [setupCodeRequired, setSetupCodeRequired] = useState(false)
  const [offlineReason, setOfflineReason] = useState('')

  const refresh = useCallback(async () => {
    try {
      const s = await api.authStatus()
      setUser(s.user)
      setSetupCodeRequired(s.setupCodeRequired)
      setStatus(s.user ? 'ready' : s.needsSetup ? 'setup' : 'login')
    } catch (e) {
      setOfflineReason((e as Error).message)
      setStatus('offline')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // The server rejected our login (expired, account stopped): back to the login screen.
  useEffect(() => {
    const lost = () => { setUser(null); setStatus('login') }
    window.addEventListener(SESSION_LOST, lost)
    return () => window.removeEventListener(SESSION_LOST, lost)
  }, [])

  const signedIn = useCallback((u: User) => { setUser(u); setStatus('ready') }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setUser(null)
    setStatus('login')
    location.hash = '#/'
  }, [])

  const value: AuthState = {
    status, user, setupCodeRequired, offlineReason, refresh, signedIn, logout,
    can: (perm) => canDo(user, perm),
    isManager: canManageUsers(user),
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
