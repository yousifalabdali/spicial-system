import { useEffect, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { Button, Field, Input, PageTitle, Panel, Select, useAction } from '../components/ui'
import type { Settings } from '../../shared/types'

export default function SettingsPage() {
  const { data } = useLoad(() => api.getSettings())
  const printers = useLoad(() => api.listPrinters())
  const [form, setForm] = useState<Settings | null>(null)
  const run = useAction()
  useEffect(() => { if (data) setForm(data) }, [data])
  if (!form) return null

  const text = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle actions={<Button onClick={() => run(() => api.saveSettings(form), 'تم حفظ الإعدادات')}><Save size={16} /> حفظ الإعدادات</Button>}>الإعدادات</PageTitle>

      <Panel title="بيانات المحل (تظهر في الفاتورة)" className="mb-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="اسم المحل" className="col-span-2"><Input value={form.shop_name} onChange={text('shop_name')} /></Field>
          <Field label="الهاتف"><Input className="num text-right" value={form.shop_phone} onChange={text('shop_phone')} /></Field>
          <Field label="العنوان"><Input value={form.shop_address} onChange={text('shop_address')} /></Field>
          <Field label="عبارة أسفل الفاتورة" className="col-span-2"><Input value={form.receipt_footer} onChange={text('receipt_footer')} /></Field>
        </div>
      </Panel>

      <Panel title="الضريبة" className="mb-4">
        <div className="grid grid-cols-3 items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={form.vat_enabled} onChange={(e) => setForm({ ...form, vat_enabled: e.target.checked })} />
            تفعيل ضريبة القيمة المضافة
          </label>
          <Field label="نسبة الضريبة %">
            <Input type="number" min="0" step="0.5" className="num text-right" disabled={!form.vat_enabled} value={form.vat_rate}
              onChange={(e) => setForm({ ...form, vat_rate: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="الرقم الضريبي"><Input className="num text-right" value={form.vat_number} onChange={text('vat_number')} /></Field>
        </div>
        <p className="mt-2 text-xs text-muted">الأسعار تُدخل قبل الضريبة، وتُضاف الضريبة على إجمالي الفاتورة بعد الخصم.</p>
      </Panel>

      <Panel title="الطباعة" className="mb-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="مقاس الفاتورة">
            <Select value={form.paper} onChange={(e) => setForm({ ...form, paper: e.target.value as Settings['paper'] })}>
              <option value="80mm">طابعة حرارية 80mm</option>
              <option value="A4">ورق A4</option>
            </Select>
          </Field>
          <Field label="الطابعة">
            <Select value={form.printer_name} onChange={(e) => setForm({ ...form, printer_name: e.target.value })}>
              <option value="">الطابعة الافتراضية للنظام</option>
              {printers.data?.map((p) => <option key={p.name} value={p.name}>{p.displayName}</option>)}
            </Select>
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={form.silent_print} onChange={(e) => setForm({ ...form, silent_print: e.target.checked })} />
            طباعة مباشرة بدون نافذة الطباعة
          </label>
        </div>
      </Panel>

      <Panel title="البيانات">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted">مسح كل الأصناف والفواتير والعملاء والموردين وحركات الخزينة (ومنها البيانات التجريبية) للبدء من جديد. الإعدادات لا تُمسح.</p>
          <Button variant="danger" className="shrink-0" onClick={async () => {
            if (!confirm('سيتم مسح جميع البيانات نهائياً. هل أنت متأكد؟')) return
            if (!confirm('تأكيد أخير: لا يمكن التراجع عن هذه العملية.')) return
            if (await run(() => api.resetData(), 'تم مسح البيانات')) location.hash = '#/'
          }}><Trash2 size={16} /> مسح جميع البيانات</Button>
        </div>
      </Panel>
    </div>
  )
}
