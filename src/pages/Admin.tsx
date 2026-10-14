// Control panel. Super admins manage everyone and are the only ones who grant or withdraw permissions;
// admins manage employee accounts. The server enforces the same rules (electron/db/users.ts).
import { useEffect, useState } from 'react'
import { UserPlus, Pencil, Trash2, Power, ShieldCheck, Shield, User as UserIcon, Lock, KeyRound, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLoad } from '../lib/hooks'
import { Button, Field, IconButton, Input, Modal, PageTitle, Panel, Select, Table, useAction } from '../components/ui'
import { ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, PERMISSIONS, ROLE_LABEL, type Permission, type Role, type User, type UserInput } from '../../shared/auth'

const ROLE_STYLE: Record<Role, { cls: string; icon: React.ReactNode }> = {
  super_admin: { cls: 'bg-violet-50 text-violet-700 ring-violet-200', icon: <ShieldCheck size={14} /> },
  admin: { cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200', icon: <Shield size={14} /> },
  employee: { cls: 'bg-slate-100 text-slate-700 ring-slate-200', icon: <UserIcon size={14} /> },
}

export function RoleBadge({ role }: { role: Role }) {
  const s = ROLE_STYLE[role]
  return <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ring-1 ${s.cls}`}>{s.icon}{ROLE_LABEL[role]}</span>
}

export default function AdminPage() {
  const { user: me, refresh } = useAuth()
  const { data, reload } = useLoad(() => api.listUsers())
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const run = useAction()
  if (!me) return null
  const isSuper = me.role === 'super_admin'

  // Admins may only touch employees (and their own account through "my account").
  const canEdit = (u: User) => isSuper || (u.role === 'employee')
  const counts = { super_admin: 0, admin: 0, employee: 0, stopped: 0 }
  for (const u of data ?? []) { counts[u.role]++; if (!u.active) counts.stopped++ }

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageTitle actions={<>
        <Button variant="ghost" onClick={() => setPwOpen(true)}><KeyRound size={16} /> تغيير كلمة المرور</Button>
        <Button onClick={() => setEditing('new')}><UserPlus size={16} /> {isSuper ? 'مستخدم جديد' : 'موظف جديد'}</Button>
      </>}>لوحة التحكم</PageTitle>

      <div className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${isSuper ? 'border-violet-200 bg-violet-50/60 text-violet-800' : 'border-indigo-200 bg-indigo-50/60 text-indigo-800'}`}>
        {isSuper ? <ShieldCheck size={20} className="mt-0.5 shrink-0" /> : <Shield size={20} className="mt-0.5 shrink-0" />}
        <div>
          <b>أنت {ROLE_LABEL[me.role]}.</b>{' '}
          {isSuper
            ? 'تستطيع إضافة أي مستخدم، وتغيير دوره، ومنح الصلاحيات وسحبها، وإيقاف الحسابات وحذفها.'
            : 'تستطيع إضافة الموظفين وإيقافهم وإعادة تعيين كلمات مرورهم. منح الصلاحيات وسحبها للسوبر أدمن فقط.'}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        {([['super_admin', 'سوبر أدمن'], ['admin', 'أدمن'], ['employee', 'موظفين'], ['stopped', 'حسابات موقوفة']] as const).map(([k, label]) => (
          <div key={k} className="rounded-2xl border border-line bg-white px-4 py-3">
            <div className="text-xs font-semibold text-muted">{label}</div>
            <div className={`num text-2xl font-bold ${k === 'stopped' && counts.stopped ? 'text-rose-600' : ''}`}>{counts[k]}</div>
          </div>
        ))}
      </div>

      <Panel title="المستخدمون">
        <Table head={['الاسم', 'اسم المستخدم', 'الدور', 'الصلاحيات', 'الحالة', 'آخر دخول', '']} empty="لا يوجد مستخدمون">
          {data?.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
              <td className="font-semibold">{u.name}{u.id === me.id && <span className="mr-1.5 rounded bg-emerald-50 px-1.5 text-[11px] font-bold text-emerald-700">أنت</span>}</td>
              <td className="num text-right font-mono text-muted">{u.username}</td>
              <td><RoleBadge role={u.role} /></td>
              <td className="max-w-80">
                {u.role === 'super_admin'
                  ? <span className="text-xs font-semibold text-violet-700">كل الصلاحيات</span>
                  : <div className="flex flex-wrap gap-1">
                      {u.permissions.length === 0 && <span className="text-xs text-rose-600">بدون صلاحيات</span>}
                      {u.permissions.map((p) => <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{PERMISSIONS.find((x) => x.id === p)?.label}</span>)}
                    </div>}
              </td>
              <td>{u.active
                ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />فعّال</span>
                : <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />موقوف</span>}</td>
              <td className="num text-right text-xs text-muted">{u.last_login ?? '—'}</td>
              <td className="w-32 text-left whitespace-nowrap">
                {u.id !== me.id && canEdit(u) ? (
                  <>
                    <IconButton title="تعديل" onClick={() => setEditing(u)}><Pencil size={15} /></IconButton>
                    <IconButton title={u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                      onClick={async () => {
                        if (u.active && !confirm(`إيقاف حساب «${u.name}»؟ سيتم تسجيل خروجه فوراً.`)) return
                        if (await run(() => api.setUserActive(u.id, !u.active), u.active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب')) reload()
                      }}>
                      <Power size={15} className={u.active ? 'text-amber-600' : 'text-emerald-600'} />
                    </IconButton>
                    {isSuper && (
                      <IconButton title="حذف" onClick={async () => {
                        if (!confirm(`حذف حساب «${u.name}» نهائياً؟`)) return
                        if (await run(() => api.deleteUser(u.id), 'تم حذف الحساب')) reload()
                      }}><Trash2 size={15} className="text-rose-500" /></IconButton>
                    )}
                  </>
                ) : u.id === me.id ? (
                  <IconButton title="تعديل بياناتي" onClick={() => setEditing(u)}><Pencil size={15} /></IconButton>
                ) : (
                  <span title="الأدمن يدير الموظفين فقط" className="inline-flex p-1.5 text-slate-300"><Lock size={15} /></span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <UserModal target={editing} me={me} onClose={() => setEditing(null)}
        onSaved={(u) => { setEditing(null); reload(); if (u.id === me.id) refresh() }} />
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}

const EMPTY: UserInput = { name: '', username: '', password: '', role: 'employee', permissions: DEFAULT_EMPLOYEE_PERMISSIONS }

function UserModal({ target, me, onClose, onSaved }: { target: User | 'new' | null; me: User; onClose: () => void; onSaved: (u: User) => void }) {
  const [form, setForm] = useState<UserInput>(EMPTY)
  const run = useAction()
  const isNew = target === 'new'
  const isSuper = me.role === 'super_admin'
  const self = !isNew && target?.id === me.id
  const permsLocked = !isSuper || form.role === 'super_admin'

  useEffect(() => {
    if (!target) return
    setForm(target === 'new' ? EMPTY : { name: target.name, username: target.username, password: '', role: target.role, permissions: target.permissions })
  }, [target])

  const toggle = (p: Permission) =>
    setForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = await run(() => api.saveUser({ ...form, id: isNew ? undefined : (target as User).id }), isNew ? 'تمت إضافة المستخدم' : 'تم حفظ التغييرات')
    if (u) onSaved(u)
  }

  return (
    <Modal title={isNew ? (isSuper ? 'مستخدم جديد' : 'موظف جديد') : self ? 'بياناتي' : `تعديل: ${(target as User | null)?.name ?? ''}`} open={target !== null} onClose={onClose} width="max-w-2xl">
      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="الاسم"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></Field>
          <Field label="اسم المستخدم (للدخول)"><Input dir="ltr" className="text-left" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
          <Field label={isNew ? 'كلمة المرور' : 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)'}>
            <Input type="password" dir="ltr" className="text-left" autoComplete="new-password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} required={isNew} minLength={6} />
          </Field>
          <Field label="الدور">
            <Select value={form.role} disabled={!isSuper || self} onChange={(e) => {
              const role = e.target.value as Role
              setForm({ ...form, role, permissions: role === 'super_admin' ? ALL_PERMISSIONS : form.permissions })
            }}>
              <option value="employee">موظف</option>
              {(isSuper || form.role === 'admin') && <option value="admin">أدمن (يدير الموظفين)</option>}
              {(isSuper || form.role === 'super_admin') && <option value="super_admin">سوبر أدمن (كل شيء)</option>}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">الصلاحيات</span>
            {isSuper && form.role !== 'super_admin' && (
              <div className="flex gap-2 text-xs">
                <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setForm({ ...form, permissions: ALL_PERMISSIONS })}>منح الكل</button>
                <span className="text-slate-300">|</span>
                <button type="button" className="font-semibold text-rose-600 hover:underline" onClick={() => setForm({ ...form, permissions: [] })}>سحب الكل</button>
              </div>
            )}
          </div>
          {form.role === 'super_admin' ? (
            <p className="rounded-xl bg-violet-50 px-3 py-2.5 text-sm text-violet-800">السوبر أدمن يملك كل الصلاحيات دائماً.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSIONS.map((p) => {
                  const on = form.permissions.includes(p.id)
                  return (
                    <button key={p.id} type="button" disabled={permsLocked} onClick={() => toggle(p.id)}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-right transition ${on ? 'border-indigo-300 bg-indigo-50/60' : 'border-line bg-white'} ${permsLocked ? 'cursor-not-allowed opacity-70' : 'hover:border-indigo-300'}`}>
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-white' : 'border-slate-300 bg-white'}`}>{on && <Check size={14} />}</span>
                      <span>
                        <span className="block text-sm font-bold">{p.label}</span>
                        <span className="block text-xs text-muted">{p.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {!isSuper && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Lock size={13} /> منح الصلاحيات وسحبها للسوبر أدمن فقط{isNew && '. الموظف الجديد يبدأ بصلاحيتي الرئيسية والمبيعات'}.</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="submit">{isNew ? 'إضافة' : 'حفظ'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const run = useAction()
  useEffect(() => { if (open) { setForm({ current: '', next: '', confirm: '' }); setError('') } }, [open])
  return (
    <Modal title="تغيير كلمة المرور" open={open} onClose={onClose}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault()
        if (form.next !== form.confirm) return setError('كلمتا المرور غير متطابقتين')
        if (await run(() => api.changePassword(form.current, form.next), 'تم تغيير كلمة المرور')) onClose()
      }}>
        <Field label="كلمة المرور الحالية"><Input type="password" dir="ltr" className="text-left" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoFocus /></Field>
        <Field label="كلمة المرور الجديدة"><Input type="password" dir="ltr" className="text-left" autoComplete="new-password" minLength={6} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /></Field>
        <Field label="تأكيد كلمة المرور الجديدة"><Input type="password" dir="ltr" className="text-left" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></Field>
        {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button><Button type="submit">حفظ</Button></div>
      </form>
    </Modal>
  )
}
