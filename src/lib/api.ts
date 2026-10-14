// Typed proxy over the backend: api.listProducts() runs listProducts on the other side.
// Desktop app: over Electron IPC. Website: POST /api/<name>. Same calls, same permission checks.
import type { ApiResult, Handlers } from '../../electron/handlers'
import { webPlatform } from './webPlatform'

type Api = { [K in keyof Handlers]: (...args: Parameters<Handlers[K]>) => Promise<Awaited<ReturnType<Handlers[K]>>> }

declare global {
  interface Window {
    bridge?: { invoke: (name: string, ...args: unknown[]) => Promise<ApiResult<unknown>> }
  }
}

export const isDesktop = typeof window !== 'undefined' && !!window.bridge

/** Fired when the server says the login is gone (expired, account stopped). The auth provider listens. */
export const SESSION_LOST = 'session-lost'

async function call(name: string, args: unknown[]): Promise<ApiResult<unknown>> {
  if (window.bridge) return window.bridge.invoke(name, ...args)
  try {
    const r = await fetch(`api/${name}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    })
    return (await r.json()) as ApiResult<unknown>
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت' }
  }
}

export const api = new Proxy({} as Api, {
  get: (_t, name: string) => async (...args: unknown[]) => {
    // On the website, printing and file saving happen in the browser.
    if (!isDesktop && Object.hasOwn(webPlatform, name)) return webPlatform[name as keyof typeof webPlatform](...(args as [never, never]))
    const res = await call(name, args)
    if (!res.ok) {
      if (res.status === 401 && name !== 'login') window.dispatchEvent(new Event(SESSION_LOST))
      throw new Error(res.error)
    }
    return res.data
  },
})
