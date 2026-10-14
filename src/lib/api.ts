// Typed proxy over the website API: api.listProducts() -> POST /api/listProducts.
// The desktop app opens this same website, so there is one path for everyone.
import type { Handlers } from '../../electron/api'
import type { DesktopBridge } from '../../shared/desktop'
import { webPlatform } from './webPlatform'

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never }
type Api = Async<Handlers> & Async<typeof webPlatform>

declare global {
  interface Window {
    desktop?: DesktopBridge // present when the page runs inside the desktop app
  }
}

/** Running inside the desktop app (direct printing, device backups). */
export const isDesktop = typeof window !== 'undefined' && !!window.desktop

/** Fired when the server says the login is gone (expired, account stopped). The auth provider listens. */
export const SESSION_LOST = 'session-lost'

type Result = { ok: true; data: unknown } | { ok: false; error: string; status?: number }

async function call(name: string, args: unknown[]): Promise<Result> {
  try {
    const r = await fetch(`api/${name}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await r.text()
    try {
      return JSON.parse(text) as Result
    } catch {
      // Not our JSON: the function didn't run (wrong deploy, crashed, or the host's own error page).
      return { ok: false, error: `الخادم لم يردّ بشكل صحيح (HTTP ${r.status}). تحقق من سجلات الاستضافة (Deploy Logs)`, status: r.status === 401 ? 401 : undefined }
    }
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') return { ok: false, error: 'الخادم لم يردّ خلال 30 ثانية (غالباً لا يستطيع الاتصال بقاعدة البيانات). تحقق من DATABASE_URL وسجلات الاستضافة' }
    return { ok: false, error: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت' }
  }
}

export const api = new Proxy({} as Api, {
  get: (_t, name: string) => async (...args: unknown[]) => {
    // Printing and file saving happen on this side (browser or desktop app).
    if (Object.hasOwn(webPlatform, name)) return (webPlatform[name as keyof typeof webPlatform] as (...a: unknown[]) => unknown)(...args)
    const res = await call(name, args)
    if (!res.ok) {
      if (res.status === 401 && name !== 'login') window.dispatchEvent(new Event(SESSION_LOST))
      throw new Error(res.error)
    }
    return res.data
  },
})
