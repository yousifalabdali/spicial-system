// Backups (super admin only, in the control panel).
//  - Anywhere: download a backup file now, or restore one.
//  - In the desktop app: automatic backups into a folder on this computer, on a schedule.
import { useCallback, useEffect, useRef, useState } from 'react'
import { DatabaseBackup, FolderOpen, FolderCog, Download, Upload, CheckCircle2, AlertTriangle, Clock, Monitor, Cloud } from 'lucide-react'
import { api, isDesktop } from '../lib/api'
import { download } from '../lib/webPlatform'
import { useAuth } from '../lib/auth'
import { Button, Field, Panel, Select, Table, useAction, useToast } from './ui'
import type { DeviceBackupState } from '../../shared/desktop'

const INTERVALS = [
  { h: 1, label: 'كل ساعة' },
  { h: 6, label: 'كل 6 ساعات' },
  { h: 12, label: 'كل 12 ساعة' },
  { h: 24, label: 'يومياً' },
  { h: 168, label: 'أسبوعياً' },
]

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const stamp = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}` // local time
}

/** Runs in the background of the desktop app while a super admin is logged in: saves a backup when one is due. */
export function DesktopAutoBackup() {
  const { user } = useAuth()
  const running = useRef(false)
  useEffect(() => {
    if (!window.desktop || user?.role !== 'super_admin') return
    const tick = async () => {
      if (running.current) return
      running.current = true
      try {
        const s = await window.desktop!.backup.state()
        if (!s.due) return
        const data = await api.exportBackup()
        await window.desktop!.backup.save(JSON.stringify(data))
      } catch (e) {
        await window.desktop!.backup.fail((e as Error).message).catch(() => {})
      } finally {
        running.current = false
      }
    }
    const first = setTimeout(tick, 15_000)
    const every = setInterval(tick, 5 * 60_000)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [user?.role])
  return null
}

function DeviceBackups() {
  const [state, setState] = useState<DeviceBackupState | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useAction()
  const reload = useCallback(() => window.desktop!.backup.state().then(setState), [])
  useEffect(() => { reload() }, [reload])
  if (!state) return null
  const cfg = state.config
  const intervals = INTERVALS.some((i) => i.h === cfg.intervalHours) ? INTERVALS : [...INTERVALS, { h: cfg.intervalHours, label: `كل ${cfg.intervalHours} ساعة` }]
  const update = async (patch: Partial<typeof cfg>) => { const s = await run(() => window.desktop!.backup.saveConfig(patch), 'تم الحفظ'); if (s) setState(s) }

  const backupNow = async () => {
    setBusy(true)
    const s = await run(async () => window.desktop!.backup.save(JSON.stringify(await api.exportBackup())), 'تم حفظ نسخة في المجلد')
    setBusy(false)
    if (s) setState(s)
  }

  return (
    <div className="mt-5 rounded-2xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold"><Monitor size={17} className="text-accent" /> النسخ التلقائي على هذا الجهاز</span>
        <Button variant="soft" disabled={busy} onClick={backupNow}><DatabaseBackup size={16} /> نسخ الآن إلى المجلد</Button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className={`rounded-xl border p-3 ${state.last?.ok === false ? 'border-rose-200 bg-rose-50' : 'border-line bg-slate-50'}`}>
          <div className="text-xs font-semibold text-muted">آخر نسخة</div>
          {state.last ? (
            <div className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${state.last.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {state.last.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span className="num">{state.last.at}</span>
            </div>
          ) : <div className="mt-1 text-sm font-bold text-muted">لم تُنشأ نسخة بعد</div>}
          {state.last?.ok === false && <div className="mt-1 text-xs text-rose-700">{state.last.error}</div>}
        </div>
        <div className="rounded-xl border border-line bg-slate-50 p-3">
          <div className="text-xs font-semibold text-muted">النسخة القادمة</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-bold"><Clock size={16} className="text-muted" />{state.nextAt ? <span className="num">{state.nextAt}</span> : <span className="text-muted">متوقف</span>}</div>
        </div>
        <div className="rounded-xl border border-line bg-slate-50 p-3">
          <div className="text-xs font-semibold text-muted">النسخ في المجلد</div>
          <div className="num mt-1 text-sm font-bold">{state.files.length} / {cfg.keep}</div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={cfg.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          تفعيل النسخ التلقائي
        </label>
        <Field label="التكرار">
          <Select value={cfg.intervalHours} disabled={!cfg.enabled} onChange={(e) => update({ intervalHours: Number(e.target.value) })}>
            {intervals.map((i) => <option key={i.h} value={i.h}>{i.label}</option>)}
          </Select>
        </Field>
        <Field label="عدد النسخ المحفوظة (الأقدم تُحذف)">
          <Select value={cfg.keep} onChange={(e) => update({ keep: Number(e.target.value) })}>
            {[...new Set([7, 14, 30, 60, 90, cfg.keep])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} نسخة</option>)}
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
        <FolderOpen size={17} className="shrink-0 text-muted" />
        <span className="text-muted">المجلد:</span>
        <span className="num min-w-0 flex-1 truncate font-mono text-xs" dir="ltr" title={cfg.dir}>{cfg.dir}</span>
        <Button variant="ghost" className="!py-1.5" onClick={async () => { const s = await run(() => window.desktop!.backup.chooseDir()); if (s && s !== true) setState(s) }}><FolderCog size={15} /> تغيير</Button>
        <Button variant="ghost" className="!py-1.5" onClick={() => run(() => window.desktop!.backup.openDir())}><FolderOpen size={15} /> فتح</Button>
      </div>
      <p className="mt-2 text-xs text-muted">يعمل النسخ التلقائي والبرنامج مفتوح بحساب سوبر أدمن. للأمان أكثر اختر مجلداً على فلاشة أو متزامناً مع Google Drive أو OneDrive.</p>

      {state.files.length > 0 && (
        <div className="mt-3">
          <Table head={['الملف', 'التاريخ', 'الحجم']}>
            {state.files.slice(0, 6).map((f) => (
              <tr key={f.name}>
                <td className="num text-right font-mono text-xs">{f.name}</td>
                <td className="num text-right text-muted">{f.created}</td>
                <td className="num text-right text-muted">{size(f.size)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  )
}

export function BackupPanel() {
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const run = useAction()
  const toast = useToast()

  const downloadNow = async () => {
    setBusy(true)
    const data = await run(() => api.exportBackup())
    setBusy(false)
    if (data) download(`sales-backup-${stamp()}.json`, JSON.stringify(data), 'application/json')
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    let data
    try { data = JSON.parse(await file.text()) } catch { return toast('الملف ليس نسخة احتياطية صالحة', 'error') }
    if (data?.app !== 'sales-inventory-pro') return toast('هذا الملف ليس نسخة احتياطية من هذا النظام', 'error')
    const c = data.counts ?? {}
    if (!confirm(`استعادة النسخة المأخوذة في ${data.exported_at}؟\n\nفيها ${c.products ?? 0} صنف و${c.sales_invoices ?? 0} فاتورة و${c.customers ?? 0} عميل.\n\nستُستبدل كل بيانات المحل الحالية بها (الحسابات لا تتغير).`)) return
    if (!confirm('تأكيد أخير: البيانات الحالية ستُحذف ولا يمكن التراجع. هل نزّلت نسخة من البيانات الحالية أولاً؟')) return
    setBusy(true)
    const r = await run(() => api.restoreBackup(data), 'تمت استعادة النسخة')
    setBusy(false)
    if (r) setTimeout(() => location.reload(), 800)
  }

  return (
    <Panel className="mt-4" title={<span className="flex items-center gap-2"><DatabaseBackup size={18} className="text-accent" /> النسخ الاحتياطي</span>}>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={downloadNow}><Download size={16} /> تنزيل نسخة احتياطية الآن</Button>
        <Button variant="ghost" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} /> استعادة من ملف</Button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { restore(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <Cloud size={14} className="mt-0.5 shrink-0" />
        الملف يحوي الأصناف والفواتير والعملاء والموردين والخزينة والإعدادات (بدون الحسابات وكلمات المرور). البيانات نفسها محفوظة في Supabase، وهذه نسخة إضافية لديك.
      </p>
      {isDesktop && <DeviceBackups />}
    </Panel>
  )
}
