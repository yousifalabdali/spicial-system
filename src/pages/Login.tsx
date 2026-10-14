import { useState } from 'react'
import { ScanBarcode, LogIn, ShieldCheck, KeyRound, WifiOff } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Field, Input } from '../components/ui'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center bg-[radial-gradient(ellipse_at_top,_#e0e7ff_0%,_#f3f5fa_55%)] p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <ScanBarcode size={28} />
          </div>
          <div className="mt-3 text-xl font-bold" dir="ltr">Sales Inventory <span className="text-accent">PRO</span></div>
          <div className="text-sm text-muted">نظام إدارة المخزون والمبيعات</div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-xl shadow-slate-900/5">{children}</div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { status, setupCodeRequired, offlineReason, signedIn, refresh } = useAuth()
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '', code: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  if (status === 'offline') {
    return (
      <Shell>
        <div className="text-center">
          <WifiOff size={32} className="mx-auto text-rose-500" />
          <p className="mt-2 font-bold">تعذّر الاتصال بالخادم</p>
          <p className="mt-1 text-sm text-muted">تحقق من الإنترنت ثم أعد المحاولة.</p>
          {offlineReason && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">السبب: {offlineReason}</p>}
          <Button className="mt-4" onClick={refresh}>إعادة المحاولة</Button>
        </div>
      </Shell>
    )
  }

  const setup = status === 'setup'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (setup && form.password !== form.confirm) return setError('كلمتا المرور غير متطابقتين')
    setBusy(true)
    try {
      const user = setup
        ? await api.setupFirstAdmin({ name: form.name, username: form.username, password: form.password, code: form.code })
        : await api.login(form.username, form.password)
      signedIn(user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-accent">{setup ? <ShieldCheck size={20} /> : <LogIn size={20} />}</span>
          <div>
            <h1 className="font-bold">{setup ? 'إنشاء حساب السوبر أدمن' : 'تسجيل الدخول'}</h1>
            <p className="text-xs text-muted">{setup ? 'أول مرة: هذا الحساب يملك كل الصلاحيات ويدير باقي الحسابات' : 'أدخل اسم المستخدم وكلمة المرور'}</p>
          </div>
        </div>

        {setup && <Field label="الاسم"><Input value={form.name} onChange={set('name')} placeholder="مثال: يوسف" autoFocus /></Field>}
        <Field label="اسم المستخدم">
          <Input value={form.username} onChange={set('username')} dir="ltr" className="text-left" autoComplete="username" autoFocus={!setup} required />
        </Field>
        <Field label="كلمة المرور">
          <Input type="password" value={form.password} onChange={set('password')} dir="ltr" className="text-left" autoComplete={setup ? 'new-password' : 'current-password'} required />
        </Field>
        {setup && (
          <Field label="تأكيد كلمة المرور">
            <Input type="password" value={form.confirm} onChange={set('confirm')} dir="ltr" className="text-left" autoComplete="new-password" required />
          </Field>
        )}
        {setup && setupCodeRequired && (
          <Field label="رمز الإعداد">
            <div className="relative">
              <KeyRound size={17} className="absolute top-2.5 right-3 text-muted" />
              <Input value={form.code} onChange={set('code')} dir="ltr" className="pr-10 text-left font-mono uppercase" required />
            </div>
            <span className="mt-1 block text-xs text-muted">يظهر في سجل تشغيل الخادم عند أول تشغيل. يمنع أي شخص آخر من إنشاء هذا الحساب.</span>
          </Field>
        )}

        {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}

        <Button type="submit" className="w-full py-2.5" disabled={busy}>
          {setup ? <><ShieldCheck size={18} /> إنشاء الحساب والدخول</> : <><LogIn size={18} /> دخول</>}
        </Button>
      </form>
    </Shell>
  )
}
