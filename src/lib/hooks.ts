import { useCallback, useEffect, useState } from 'react'

/** Load async data, with a reload() to refresh after a change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps)
  const reload = useCallback(() => {
    load().then((d) => { setData(d); setError(null) }, (e: Error) => setError(e.message))
  }, [load])
  useEffect(reload, [reload])
  return { data, error, reload }
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const monthStart = () => today().slice(0, 8) + '01'
