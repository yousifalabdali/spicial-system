import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ComponentProps, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'
import { fmt, toBaisa, toOmrInput } from '../lib/money'

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgb(15_23_42/0.04),0_4px_16px_rgb(15_23_42/0.04)] ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}

export type Tone = 'indigo' | 'emerald' | 'rose' | 'violet' | 'sky' | 'amber' | 'teal' | 'slate'
export const TONE: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  violet: 'bg-violet-50 text-violet-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
  teal: 'bg-teal-50 text-teal-600',
  slate: 'bg-slate-100 text-slate-600',
}

export function StatCard({ label, value, icon, suffix, tone = 'indigo', onClick }: { label: string; value: ReactNode; icon: ReactNode; suffix?: string; tone?: Tone; onClick?: () => void }) {
  return (
    <div onClick={onClick}
      className={`flex items-center gap-4 rounded-2xl border border-line bg-panel px-4 py-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${onClick ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-muted">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5 text-[22px] leading-tight font-bold text-ink">
          <span className="num">{value}</span>
          {suffix && <span className="text-sm font-semibold text-muted">{suffix}</span>}
        </div>
      </div>
    </div>
  )
}

export function Money({ v, className = '' }: { v: number; className?: string }) {
  return <span className={`num ${className}`}>{fmt(v)}</span>
}

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'success' | 'soft'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-600/20',
  ghost: 'bg-white hover:bg-slate-50 border border-line text-ink',
  soft: 'bg-accent-soft hover:bg-indigo-100 text-accent',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${BTN[variant]} ${className}`}
    />
  )
}

export function IconButton({ title, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return <button {...props} title={title} className={`rounded-lg p-1.5 text-muted transition hover:bg-slate-100 hover:text-ink ${className}`} />
}

const fieldCls = 'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:bg-slate-50 disabled:text-muted'

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input lang="en" {...props} className={`${fieldCls} ${className}`} />
}

/** Amount input in OMR that reports baisa; keeps the typed text while editing. */
export function MoneyInput({ value, onChange, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange: (baisa: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input {...props} type="text" inputMode="decimal" lang="en"
      className={`${fieldCls} num text-right ${className}`}
      value={text ?? (value ? toOmrInput(value) : '')}
      placeholder="0.000"
      onFocus={(e) => { setText(value ? toOmrInput(value) : ''); e.target.select() }}
      onChange={(e) => {
        // Accept Arabic-Indic digits too, store as plain "1.250".
        const v = e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.').replace(/[^\d.]/g, '')
        setText(v); onChange(toBaisa(v))
      }}
      onBlur={() => setText(null)} />
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldCls} ${className}`}>{children}</select>
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}

export function Modal({ title, open, onClose, children, width = 'max-w-lg' }: { title: string; open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={`max-h-full w-full ${width} overflow-auto rounded-2xl border border-line bg-panel shadow-2xl shadow-slate-900/20`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-5 py-3.5 backdrop-blur">
          <h3 className="font-bold">{title}</h3>
          <IconButton title="إغلاق" onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Table({ head, children, empty = 'لا توجد بيانات' }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.flat().some(Boolean) : Boolean(children)
  return (
    <div className="overflow-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-head text-[13px] text-muted">
            {head.map((h, i) => <th key={i} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line [&>tr]:transition-colors [&>tr:hover]:bg-indigo-50/40 [&_td]:px-3 [&_td]:py-2.5">
          {hasRows ? children : <tr><td colSpan={head.length} className="py-10 text-center text-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[] }) {
  return (
    <div className="mb-4 inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`rounded-lg px-5 py-1.5 text-sm font-semibold transition ${value === t.id ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold">{children}</h1>
      <div className="flex gap-2">{actions}</div>
    </div>
  )
}

// ---- Toasts ----
type Toast = { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 2500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 left-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${t.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

type Done<T> = (T extends void | undefined | null ? true : T) | undefined

/** Run an action, show its error as a toast. Returns undefined on error, the result (or true) on success. */
export function useAction() {
  const toast = useToast()
  return useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<Done<T>> => {
    try {
      const r = await fn()
      if (success) toast(success)
      return (r ?? true) as Done<T>
    } catch (e) {
      toast((e as Error).message, 'error')
      return undefined
    }
  }, [toast])
}
