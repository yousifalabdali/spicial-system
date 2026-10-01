import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ComponentProps, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'
import { fmt, toBaisa, toOmrInput } from '../lib/money'

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-lg shadow-black/20 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

export function StatCard({ label, value, icon, suffix }: { label: string; value: ReactNode; icon: ReactNode; suffix?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 shadow-lg shadow-black/20">
      <div>
        <div className="text-sm font-semibold text-ink/90">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5 text-[22px] font-bold text-[#7fb2ff]">
          <span className="num">{value}</span>
          {suffix && <span className="text-base text-ink">{suffix}</span>}
        </div>
      </div>
      <div className="shrink-0">{icon}</div>
    </div>
  )
}

export function Money({ v, className = '' }: { v: number; className?: string }) {
  return <span className={`num ${className}`}>{fmt(v)}</span>
}

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'success'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent hover:bg-blue-500 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  danger: 'bg-rose-600/90 hover:bg-rose-500 text-white',
  ghost: 'bg-panel-2 hover:bg-head border border-line text-ink',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${className}`}
    />
  )
}

export function IconButton({ title, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return <button {...props} title={title} className={`rounded-md p-1.5 text-muted transition hover:bg-head hover:text-ink ${className}`} />
}

const fieldCls = 'w-full rounded-lg border border-line bg-page/60 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-accent'

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
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div className={`max-h-full w-full ${width} overflow-auto rounded-xl border border-line bg-panel shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-5 py-3">
          <h3 className="font-bold">{title}</h3>
          <IconButton title="إغلاق" onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/** Table with the dark striped style from the dashboard. */
export function Table({ head, children, empty = 'لا توجد بيانات' }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.flat().some(Boolean) : Boolean(children)
  return (
    <div className="overflow-auto rounded-lg border border-line/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-head text-muted">
            {head.map((h, i) => <th key={i} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line/40 [&>tr:hover]:bg-panel-2/70 [&_td]:px-3 [&_td]:py-2">
          {hasRows ? children : <tr><td colSpan={head.length} className="py-8 text-center text-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[] }) {
  return (
    <div className="mb-4 flex gap-1 rounded-xl border border-line bg-panel p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${value === t.id ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-xl font-bold">{children}</h1>
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
          <div key={t.id} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-xl ${t.kind === 'ok' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
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
