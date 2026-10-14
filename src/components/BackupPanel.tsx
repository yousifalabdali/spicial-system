// Automatic backup settings (super admin only, in the control panel).
import { useEffect, useState } from 'react'
import { DatabaseBackup, FolderOpen, FolderCog, Download, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { api, isDesktop } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { Button, Field, Panel, Select, Table, useAction } from './ui'

const INTERVALS = [
  { h: 1, label: 'كل ساعة' },
  { h: 6, label: 'كل 6 ساعات' },
  { h: 12, label: 'كل 12 ساعة' },
  { h: 24, label: 'يومياً' },
  { h: 168, label: 'أسبوعياً' },
]

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function BackupPanel() {
  const { data, reload } = useLoad(() => api.backupStatus())
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ enabled: boolean; intervalHours: number; keep: number } | null>(null)
  const run = useAction()
  useEffect(() => { if (data) setDraft({ enabled: data.config.enabled, intervalHours: data.config.intervalHours, keep: data.config.keep }) }, [data])
  if (!data || !draft) return null

  const dirty = draft.enabled !== data.config.enabled || draft.intervalHours !== data.config.intervalHours || draft.keep !== data.config.keep
  const intervals = INTERVALS.some((i) => i.h === draft.intervalHours) ? INTERVALS : [...INTERVALS, { h: draft.intervalHours, label: `كل ${draft.intervalHours} ساعة` }]

  const backupNow = async () => {
    setBusy(true)
    const r = await run(() => api.runBackup(), 'تم إنشاء نسخة احتياطية')
    setBusy(false)
    if (r) reload()
  }

  return (
    <Panel className="mt-4" title={<span className="flex items-center gap-2"><DatabaseBackup size={18} className="text-accent" /> النسخ الاحتياطي التلقائي</span>}
      actions={<Button variant="soft" disabled={busy} onClick={backupNow}><DatabaseBackup size={16} /> نسخ الآن</Button>}>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className={`rounded-xl border p-3 ${data.last?.ok === false ? 'border-rose-200 bg-rose-50' : 'border-line bg-slate-50'}`}>
          <div className="text-xs font-semibold text-muted">آخر نسخة</div>
          {data.last ? (
            <div className={`mt-1 flex items-center gap-1.5 text-sm font-bold ${data.last.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {data.last.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span className="num">{data.last.at}</span>
            </div>
          ) : <div className="mt-1 text-sm font-bold text-muted">لم تُنشأ نسخة بعد</div>}
          {data.last?.ok === false && <div className="mt-1 text-xs text-rose-700">{data.last.error}</div>}
        </div>
        <div className="rounded-xl border border-line bg-slate-50 p-3">
          <div className="text-xs font-semibold text-muted">النسخة القادمة</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-bold">
            <Clock size={16} className="text-muted" />
            {data.nextAt ? <span className="num">{data.nextAt}</span> : <span className="text-muted">متوقف</span>}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-slate-50 p-3">
          <div className="text-xs font-semibold text-muted">النسخ المحفوظة</div>
          <div className="num mt-1 text-sm font-bold">{data.files.length} / {data.config.keep}</div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-3">
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          تفعيل النسخ التلقائي
        </label>
        <Field label="التكرار">
          <Select value={draft.intervalHours} disabled={!draft.enabled} onChange={(e) => setDraft({ ...draft, intervalHours: Number(e.target.value) })}>
            {intervals.map((i) => <option key={i.h} value={i.h}>{i.label}</option>)}
          </Select>
        </Field>
        <Field label="عدد النسخ المحفوظة (الأقدم تُحذف)">
          <Select value={draft.keep} onChange={(e) => setDraft({ ...draft, keep: Number(e.target.value) })}>
            {[...new Set([7, 14, 30, 60, 90, draft.keep])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} نسخة</option>)}
          </Select>
        </Field>
        <Button disabled={!dirty} onClick={async () => { if (await run(() => api.saveBackupConfig(draft), 'تم حفظ إعدادات النسخ')) reload() }}>حفظ</Button>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
        <FolderOpen size={17} className="shrink-0 text-muted" />
        <span className="text-muted">المجلد:</span>
        <span className="num min-w-0 flex-1 truncate font-mono text-xs" dir="ltr" title={data.config.dir}>{data.config.dir}</span>
        {isDesktop && data.canChooseDir && (
          <>
            <Button variant="ghost" className="!py-1.5" onClick={async () => { if (await run(() => api.chooseBackupDir())) reload() }}><FolderCog size={15} /> تغيير</Button>
            <Button variant="ghost" className="!py-1.5" onClick={() => run(() => api.openBackupDir())}><FolderOpen size={15} /> فتح</Button>
          </>
        )}
      </div>
      {!isDesktop && <p className="mt-2 text-xs text-muted">النسخ تُحفظ على الخادم. نزّل نسخة إلى جهازك من القائمة أدناه واحتفظ بها في مكان آمن.</p>}
      {isDesktop && <p className="mt-2 text-xs text-muted">للأمان أكثر: اختر مجلداً على فلاشة أو مجلداً متزامناً مع Google Drive أو OneDrive.</p>}

      {data.files.length > 0 && (
        <div className="mt-4">
          <Table head={['النسخة', 'التاريخ', 'الحجم', '']}>
            {data.files.slice(0, 10).map((f) => (
              <tr key={f.name}>
                <td className="num text-right font-mono text-xs">{f.name}</td>
                <td className="num text-right text-muted">{f.created}</td>
                <td className="num text-right text-muted">{size(f.size)}</td>
                <td className="w-28 text-left">
                  {!isDesktop && <a className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline" href={`backups/${encodeURIComponent(f.name)}`} download><Download size={13} /> تنزيل</a>}
                </td>
              </tr>
            ))}
          </Table>
          {data.files.length > 10 && <p className="mt-2 text-xs text-muted">و{data.files.length - 10} نسخ أقدم في المجلد.</p>}
        </div>
      )}
    </Panel>
  )
}
