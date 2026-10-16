// Extra controls on the home page: find any product fast, see what is running low, and choose
// which home sections to show (remembered per account on this device).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ShoppingCart, Pencil, AlertTriangle, SlidersHorizontal, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { fmt } from '../lib/money'
import { Input, Panel } from './ui'
import { ProductImage } from './ProductImage'

export function QuickProductSearch({ canSell, canEdit }: { canSell: boolean; canEdit: boolean }) {
  const navigate = useNavigate()
  const { data } = useLoad(() => api.listProducts())
  const [term, setTerm] = useState('')
  const hits = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q || !data) return []
    return data.filter((p) => p.name.toLowerCase().includes(q) || p.code?.toLowerCase() === q || p.code?.toLowerCase().startsWith(q)).slice(0, 6)
  }, [data, term])

  return (
    <Panel title="بحث سريع عن صنف">
      <div className="relative">
        <Search size={18} className="absolute top-2.5 right-3 text-muted" />
        <Input className="pr-10" placeholder="اكتب اسم الصنف أو الباركود لمعرفة السعر والكمية" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {term.trim() !== '' && (
        <div className="mt-2 divide-y divide-line rounded-xl border border-line">
          {hits.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <ProductImage id={p.id} hasImage={p.has_image} className="h-9 w-9 shrink-0 rounded-lg" iconSize={15} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="num text-xs text-muted">{p.code ?? '—'}</div>
              </div>
              <span className="num rounded-lg bg-indigo-50 px-2 py-0.5 text-sm font-bold text-accent">{fmt(p.price)}</span>
              <span className={`num w-16 text-left text-sm ${p.qty <= p.min_qty ? 'font-bold text-amber-600' : 'text-muted'}`}>{p.qty} {p.unit}</span>
              {canSell && p.code && p.qty > 0 && (
                <button title="بيع" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" onClick={() => navigate(`/sales?tab=pos&add=${encodeURIComponent(p.code!)}`)}><ShoppingCart size={17} /></button>
              )}
              {canEdit && <button title="تعديل" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => navigate(`/inventory?edit=${p.id}`)}><Pencil size={16} /></button>}
            </div>
          ))}
          {!hits.length && <div className="px-3 py-4 text-center text-sm text-muted">لا يوجد صنف مطابق</div>}
        </div>
      )}
    </Panel>
  )
}

export function LowStockList({ canEdit }: { canEdit: boolean }) {
  const navigate = useNavigate()
  const { data } = useLoad(() => api.lowStockItems())
  return (
    <Panel title={<span className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500" /> أصناف تحتاج تعبئة</span>}>
      {!data?.length ? (
        <div className="py-6 text-center text-sm text-muted">{data ? 'كل الأصناف فوق الحد الأدنى 👍' : '…'}</div>
      ) : (
        <div className="max-h-64 divide-y divide-line overflow-auto">
          {data.slice(0, 30).map((p) => (
            <button key={p.id} disabled={!canEdit} onClick={() => navigate(`/inventory?edit=${p.id}`)}
              className="flex w-full items-center gap-3 px-1 py-2 text-right hover:bg-slate-50 disabled:cursor-default">
              <span className="flex-1 truncate text-sm font-semibold">{p.name}</span>
              <span className={`num rounded-lg px-2 py-0.5 text-sm font-bold ${p.qty <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>{p.qty} {p.unit}</span>
              <span className="num w-20 text-left text-xs text-muted">الحد {p.min_qty}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

export type HomeSection = 'quick' | 'controls' | 'search' | 'lowStock' | 'stats' | 'latest' | 'charts'
export const HOME_SECTIONS: { id: HomeSection; label: string }[] = [
  { id: 'quick', label: 'الأزرار الرئيسية' },
  { id: 'controls', label: 'لوحة التحكم' },
  { id: 'search', label: 'البحث السريع' },
  { id: 'lowStock', label: 'أصناف تحتاج تعبئة' },
  { id: 'stats', label: 'الأرقام' },
  { id: 'latest', label: 'آخر الفواتير والتنبيهات' },
  { id: 'charts', label: 'الرسوم البيانية' },
]

/** Which sections are hidden, per account, kept in this browser. */
export function useHomeLayout(userId: number | undefined) {
  const key = `home.hidden.${userId ?? 0}`
  const [hidden, setHidden] = useState<HomeSection[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
  })
  const toggle = (id: HomeSection) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]
    setHidden(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
  }
  return { show: (id: HomeSection) => !hidden.includes(id), toggle, hidden }
}

export function CustomizeHome({ layout }: { layout: ReturnType<typeof useHomeLayout> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-indigo-200">
        <SlidersHorizontal size={16} /> تخصيص الرئيسية
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-60 rounded-xl border border-line bg-white p-2 shadow-xl">
          {HOME_SECTIONS.map((s) => (
            <button key={s.id} onClick={() => layout.toggle(s.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm hover:bg-slate-50">
              <span className={`grid h-5 w-5 place-items-center rounded-md border ${layout.show(s.id) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-line'}`}>
                {layout.show(s.id) && <Check size={14} />}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
