// Typed proxy over the IPC bridge: api.listProducts() calls handlers.listProducts in the main process.
import type { ApiResult, Handlers } from '../../electron/handlers'

type Api = { [K in keyof Handlers]: (...args: Parameters<Handlers[K]>) => Promise<Awaited<ReturnType<Handlers[K]>>> }

declare global {
  interface Window {
    bridge: { invoke: (name: string, ...args: unknown[]) => Promise<ApiResult<unknown>> }
  }
}

export const api = new Proxy({} as Api, {
  get: (_t, name: string) => async (...args: unknown[]) => {
    const res = await window.bridge.invoke(name, ...args)
    if (!res.ok) throw new Error(res.error)
    return res.data
  },
})
