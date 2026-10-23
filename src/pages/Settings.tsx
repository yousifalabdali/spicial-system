import { useEffect, useState } from 'react'
import { Save, Trash2, ScanBarcode, CheckCircle2, Usb, Mail, Send } from 'lucide-react'
import { api, isDesktop } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLoad } from '../lib/hooks'
import { useLastScan, useScanner } from '../lib/scanner'
import { Button, Field, Input, PageTitle, Panel, Select, useAction } from '../components/ui'
import { LabelPreview } from '../components/Barcode'
import type { Settings } from '../../shared/types'

function Check({ label, checked, onChange, className = '' }: { label: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-sm font-semibold ${className}`}>
      <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** Low-stock email: who gets it, and a test send. The SMTP account itself lives in server variables. */
function EmailAlerts({ form, setForm }: { form: Settings; setForm: (s: Settings) => void }) {
  const status = useLoad(() => api.emailStatus())
  const run = useAction()
  const configured = status.data?.configured
  return (
    <div className="space-y-3">
      <Check label="أرسل بريداً تلقائياً عندما يصل أي صنف إلى الحد الأدنى للمخزون" checked={form.low_stock_email_enabled}
        onChange={(v) => setForm({ ...form, low_stock_email_enabled: v })} />
      <div className="flex items-end gap-2">
        <Field label="البريد الذي يستلم التنبيه (أكثر من بريد: افصل بفاصلة)" className="flex-1">
          <Input dir="ltr" className="text-left" placeholder="owner@example.com" value={form.low_stock_email}
            onChange={(e) => setForm({ ...form, low_stock_email: e.target.value })} />
        </Field>
        <Button variant="ghost" disabled={!configured || !form.low_stock_email.trim()}
          onClick={() => run(async () => { const to = await api.sendTestEmail(form.low_stock_email); return to }, 'تم إرسال رسالة تجربة. افحص بريدك')}>
          <Send size={16} /> رسالة تجربة
        </Button>
      </div>
      {status.data && configured && (
        <p className="text-xs text-emerald-700">✓ الخادم جاهز للإرسال عبر <span dir="ltr" className="font-mono">{status.data.provider}</span>. اضغط «رسالة تجربة» للتأكد، ثم احفظ الإعدادات.</p>
      )}
      {status.data && !configured && (
        <div className="space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">الخادم لم يُعدّ للإرسال بعد. الأسهل (يعمل على Railway):</p>
          <ol className="list-decimal space-y-0.5 pr-5">
            <li>سجّل مجاناً في brevo.com وأضف بريدك كمرسِل وأكّده (Senders).</li>
            <li>من SMTP &amp; API ← API Keys أنشئ مفتاحاً.</li>
            <li>في متغيّرات الاستضافة (أو ملف .env محلياً) أضف: <span dir="ltr" className="font-mono">BREVO_API_KEY</span> و <span dir="ltr" className="font-mono">MAIL_FROM=بريدك المؤكد</span> ثم أعد النشر.</li>
          </ol>
          <p>بديل: <span dir="ltr" className="font-mono">RESEND_API_KEY</span>، أو SMTP (Gmail) لكن Railway يحجبه في الخطط المجانية.</p>
        </div>
      )}
      <p className="text-xs text-muted">يُرسل التنبيه مرة واحدة لكل صنف عند وصوله للحد الأدنى، ويتجدد بعد إعادة تعبئته فوق الحد. حدد «الحد الأدنى» لكل صنف من شاشة المخزون.</p>
    </div>
  )
}

/** Connection steps, plus a live check that the scanner is reaching the app. */
function ScannerTest() {
  const last = useLastScan()
  useScanner(() => {}) // on this page a scan is only a test: don't open the label dialog
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <ol className="space-y-2.5 text-sm">
        {[
          'وصّل القارئ بمنفذ USB (أو اقرنه عبر Bluetooth). لا يحتاج أي تعريفات.',
          'تأكد أن القارئ مضبوط على إرسال Enter بعد الكود (الإعداد الافتراضي لأغلب القارئات).',
          'امسح أي باركود: في شاشة البيع يُضاف للفاتورة، وفي باقي الشاشات تظهر نافذة طباعة الملصق.',
        ].map((t, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-accent">{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
      <div className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${last ? 'border-emerald-300 bg-emerald-50' : 'border-line bg-slate-50'}`}>
        {last ? (
          <>
            <CheckCircle2 size={30} className="text-emerald-600" />
            <div className="mt-1 font-bold text-emerald-700">القارئ يعمل</div>
            <div className="num mt-1 font-mono text-sm">{last.code}</div>
          </>
        ) : (
          <>
            <div className="flex gap-1 text-slate-400"><Usb size={26} /><ScanBarcode size={26} /></div>
            <div className="mt-1 font-semibold">اختبر القارئ</div>
            <div className="text-xs text-muted">امسح أي باركود الآن وسيظهر هنا</div>
          </>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data } = useLoad(() => api.getSettings())
  const printers = useLoad(() => api.listPrinters())
  const [form, setForm] = useState<Settings | null>(null)
  const run = useAction()
  const { user } = useAuth()
  useEffect(() => { if (data) setForm(data) }, [data])
  if (!form) return null

  const text = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle actions={<Button onClick={() => run(() => api.saveSettings(form), 'تم حفظ الإعدادات')}><Save size={16} /> حفظ الإعدادات</Button>}>الإعدادات</PageTitle>

      <Panel title="بيانات المحل (تظهر في الفاتورة)" className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="اسم المحل" className="col-span-2"><Input value={form.shop_name} onChange={text('shop_name')} /></Field>
          <Field label="الهاتف"><Input className="num text-right" value={form.shop_phone} onChange={text('shop_phone')} /></Field>
          <Field label="العنوان"><Input value={form.shop_address} onChange={text('shop_address')} /></Field>
          <Field label="عبارة أسفل الفاتورة" className="col-span-2"><Input value={form.receipt_footer} onChange={text('receipt_footer')} /></Field>
        </div>
      </Panel>

      <Panel title="الضريبة" className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.vat_enabled} onChange={(e) => setForm({ ...form, vat_enabled: e.target.checked })} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="مقاس الفاتورة">
            <Select value={form.paper} onChange={(e) => setForm({ ...form, paper: e.target.value as Settings['paper'] })}>
              <option value="80mm">طابعة حرارية 80mm</option>
              <option value="A4">ورق A4</option>
            </Select>
          </Field>
          {isDesktop && <Field label="الطابعة">
            <Select value={form.printer_name} onChange={(e) => setForm({ ...form, printer_name: e.target.value })}>
              <option value="">الطابعة الافتراضية للنظام</option>
              {printers.data?.map((p) => <option key={p.name} value={p.name}>{p.displayName}</option>)}
            </Select>
          </Field>}
          {isDesktop ? (
            <label className="col-span-2 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.silent_print} onChange={(e) => setForm({ ...form, silent_print: e.target.checked })} />
              طباعة مباشرة بدون نافذة الطباعة
            </label>
          ) : (
            <p className="col-span-2 text-xs text-muted">في الموقع تُختار الطابعة من نافذة الطباعة في المتصفح.</p>
          )}
          <Check className="col-span-2" label="إظهار صور المنتجات بجانب الأصناف في الفاتورة المطبوعة" checked={form.receipt_show_images} onChange={(v) => setForm({ ...form, receipt_show_images: v })} />
        </div>
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><Mail size={18} /> تنبيهات المخزون بالبريد</span>} className="mb-4">
        <EmailAlerts form={form} setForm={setForm} />
      </Panel>

      <Panel title="قارئ الباركود" className="mb-4">
        <ScannerTest />
      </Panel>

      <Panel title="طباعة ملصقات الباركود" className="mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="مقاس الملصق (مم)">
              <Select value={form.label_size} onChange={(e) => setForm({ ...form, label_size: e.target.value as Settings['label_size'] })}>
                <option value="50x25">50 × 25 (الأكثر شيوعاً)</option>
                <option value="40x30">40 × 30</option>
                <option value="38x25">38 × 25</option>
                <option value="58x40">58 × 40</option>
              </Select>
            </Field>
            {isDesktop && <Field label="طابعة الملصقات">
              <Select value={form.label_printer} onChange={(e) => setForm({ ...form, label_printer: e.target.value })}>
                <option value="">الطابعة الافتراضية للنظام</option>
                {printers.data?.map((p) => <option key={p.name} value={p.name}>{p.displayName}</option>)}
              </Select>
            </Field>}
            <Check label="إظهار اسم المحل على الملصق" checked={form.label_show_shop} onChange={(v) => setForm({ ...form, label_show_shop: v })} />
            <Check label="إظهار السعر على الملصق" checked={form.label_show_price} onChange={(v) => setForm({ ...form, label_show_price: v })} />
            <Check className="col-span-2" label="طباعة الملصق تلقائياً بمجرد مسح المنتج (خارج شاشة البيع)" checked={form.scan_auto_print} onChange={(v) => setForm({ ...form, scan_auto_print: v })} />
          </div>
          <div className="w-full sm:w-72 rounded-xl bg-slate-100 p-4">
            <div className="mb-2 text-xs font-semibold text-muted">معاينة</div>
            <LabelPreview settings={form} product={{ id: 0, name: 'مثال: عصير برتقال 1 لتر', code: '6281234567890', category: null, unit: 'حبة', cost: 0, price: 1250, wholesale_price: 0, qty: 0, min_qty: 0, created_at: '', has_image: 0 }} />
          </div>
        </div>
        {isDesktop && <p className="mt-3 text-xs text-muted">لطابعة ملصقات (مثل Xprinter أو Zebra) اخترها هنا، وفعّل «طباعة مباشرة بدون نافذة الطباعة» في قسم الطباعة لتطبع فوراً.</p>}
      </Panel>

      {user?.role === 'super_admin' && <Panel title="البيانات">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted">مسح كل الأصناف والفواتير والعملاء والموردين وحركات الخزينة (ومنها البيانات التجريبية) للبدء من جديد. الإعدادات لا تُمسح.</p>
          <Button variant="danger" className="shrink-0" onClick={async () => {
            if (!confirm('سيتم مسح جميع البيانات نهائياً. هل أنت متأكد؟')) return
            if (!confirm('تأكيد أخير: لا يمكن التراجع عن هذه العملية.')) return
            if (await run(() => api.resetData(), 'تم مسح البيانات')) location.hash = '#/'
          }}><Trash2 size={16} /> مسح جميع البيانات</Button>
        </div>
      </Panel>}
    </div>
  )
}
