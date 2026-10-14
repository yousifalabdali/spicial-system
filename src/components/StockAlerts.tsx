// Low-stock bell in the top bar, plus a system notification (Windows / macOS / browser)
// when a product drops to its alert level. Checks every minute and right after a sale or stock edit.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, PackageX } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from './ui'

/** Fire after anything that changes quantities (a sale, a stock edit) to re-check at once. */
export const STOCK_CHANGED = 'stock-changed'

type Item = Awaited<ReturnType<typeof api.lowStockItems>>[number]

const PREF = 'notify-low-stock'
const readPref = () => { try { return localStorage.getItem(PREF) !== 'off' } catch { return true } }
const writePref = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off') } catch { /* private mode */ } }

function systemNotify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try { new Notification(title, { body, tag: 'low-stock' }) } catch { /* some browsers only allow it from a service worker */ }
}

export function StockAlerts() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [notify, setNotify] = useState(readPref)
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'denied' : Notification.permission)
  const known = useRef<Set<number> | null>(null) // products already low at the last check
  const box = useRef<HTMLDivElement>(null)

  const check = useCallback(async () => {
    const list = await api.lowStockItems().catch(() => null)
    if (!list) return
    setItems(list)
    const prev = known.current
    known.current = new Set(list.map((i) => i.id))
    if (!notify) return
    if (prev === null) {
      // First check after opening the app: one summary, not one per product.
      if (list.length) systemNotify('تنبيه المخزون', `${list.length} صنف وصل إلى حد التنبيه أو نفد`)
      return
    }
    const fresh = list.filter((i) => !prev.has(i.id))
    for (const i of fresh.slice(0, 3)) {
      const msg = i.qty <= 0 ? `«${i.name}» نفد من المخزون` : `«${i.name}» بقي منه ${i.qty} ${i.unit} فقط`
      systemNotify('كمية قليلة', msg)
      toast(msg, 'error')
    }
  }, [notify, toast])

  useEffect(() => {
    check()
    const t = setInterval(check, 60_000)
    window.addEventListener(STOCK_CHANGED, check)
    return () => { clearInterval(t); window.removeEventListener(STOCK_CHANGED, check) }
  }, [check])

  // Close the panel on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggleNotify = async () => {
    const next = !notify
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      setPerm(await Notification.requestPermission())
    }
    setNotify(next)
    writePref(next)
  }

  const count = items.length
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="تنبيهات المخزون"
        className={`relative grid h-9 w-9 place-items-center rounded-xl border transition ${count ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100' : 'border-line bg-white text-muted hover:bg-slate-50'}`}>
        {count ? <BellRing size={18} /> : <Bell size={18} />}
        {count > 0 && <span className="num absolute -top-1.5 -left-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="absolute top-11 left-0 z-30 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-bold">أصناف بكمية قليلة</span>
            <span className="num rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{count}</span>
          </div>
          <div className="max-h-80 overflow-auto">
            {count === 0 && <div className="px-4 py-8 text-center text-sm text-muted">كل الأصناف فوق حد التنبيه</div>}
            {items.map((i) => (
              <button key={i.id} disabled={!can('inventory')} onClick={() => { setOpen(false); navigate(`/inventory?edit=${i.id}`) }}
                className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-right last:border-0 hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i.qty <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}><PackageX size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.name}</span>
                  <span className="block text-xs text-muted">حد التنبيه <span className="num">{i.min_qty}</span></span>
                </span>
                <span className={`num text-sm font-bold ${i.qty <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>{i.qty <= 0 ? 'نفد' : `${i.qty} ${i.unit}`}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-line bg-slate-50 px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={notify} onChange={toggleNotify} />
              إشعار على الجهاز عند نقص كمية صنف
            </label>
            {notify && perm === 'denied' && <p className="text-xs text-rose-600">الإشعارات محظورة لهذا الموقع في إعدادات المتصفح. ستظهر التنبيهات داخل التطبيق فقط.</p>}
            {can('inventory') && count > 0 && (
              <button className="text-xs font-semibold text-accent hover:underline" onClick={() => { setOpen(false); navigate('/inventory?low=1') }}>عرض كل الأصناف المنخفضة في المخزون</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
