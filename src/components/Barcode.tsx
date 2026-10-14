import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, FileText, Pencil, PackagePlus, ScanLine, ShoppingCart } from 'lucide-react'
import { api } from '../lib/api'
import { fmt } from '../lib/money'
import { useScanner } from '../lib/scanner'
import { barcodeSvg, isEncodable } from '../../shared/barcode'
import { Button, Field, Input, Modal, useAction } from './ui'
import type { Product, Settings } from '../../shared/types'

export function BarcodeView({ code, className = '' }: { code: string; className?: string }) {
  const svg = useMemo(() => (isEncodable(code) ? barcodeSvg(code) : null), [code])
  if (!svg) return <div className={`grid place-items-center text-xs text-rose-600 ${className}`}>كود غير صالح للباركود</div>
  // The SVG is generated locally from the code (bars only), never from user HTML.
  return <div className={`barcode ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** On-screen copy of the printed label, at the configured size. */
export function LabelPreview({ product, settings }: { product: Product; settings: Settings }) {
  const [w, h] = settings.label_size.split('x').map(Number)
  const scale = 5.2 // px per mm
  return (
    <div className="mx-auto flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white px-2 py-1.5 text-black shadow-sm"
      style={{ width: w * scale, height: h * scale }}>
      {settings.label_show_shop && <div className="truncate text-center text-[10px] leading-tight text-slate-600">{settings.shop_name}</div>}
      <div className="truncate text-center text-[12px] leading-tight font-bold">{product.name}</div>
      <BarcodeView code={product.code ?? ''} className="my-1 min-h-0 flex-1" />
      <div className="flex items-baseline justify-between text-[11px] leading-none">
        <span className="num font-mono tracking-wide">{product.code}</span>
        {settings.label_show_price && <b className="num text-[12px]">{fmt(product.price)} ر.ع</b>}
      </div>
    </div>
  )
}

/** Preview + copies + print buttons. Enter in the copies box prints. */
function LabelPrint({ product, settings, onPrinted }: { product: Product; settings: Settings; onPrinted?: () => void }) {
  const [copies, setCopies] = useState(1)
  const [busy, setBusy] = useState(false)
  const run = useAction()
  useEffect(() => setCopies(1), [product.id])

  const print = async (pdf: boolean) => {
    setBusy(true)
    const ok = await run(() => api.printLabel(product.id, { copies, pdf }), pdf ? undefined : 'تم إرسال الملصق للطابعة')
    setBusy(false)
    if (ok && !pdf) onPrinted?.()
  }

  if (!product.code) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">هذا الصنف ليس له باركود. أضف له كوداً من شاشة المخزون (أو اضغط «توليد») ثم اطبع.</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-100 p-5"><LabelPreview product={product} settings={settings} /></div>
      <div className="flex items-end gap-2">
        <Field label="عدد النسخ" className="w-28">
          <Input type="number" min={1} max={500} autoFocus className="num text-center" value={copies}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
            onKeyDown={(e) => e.key === 'Enter' && print(false)} />
        </Field>
        <Button className="flex-1 py-2.5" disabled={busy} onClick={() => print(false)}><Printer size={18} /> طباعة الملصق</Button>
        <Button variant="ghost" className="py-2.5" disabled={busy} title="فتح الملصق كملف PDF" onClick={() => print(true)}><FileText size={18} /> معاينة</Button>
      </div>
      <p className="text-xs text-muted">مقاس الملصق <span className="num">{settings.label_size.replace('x', '×')}</span> مم · يمكن تغييره من الإعدادات ← طباعة الباركود</p>
    </div>
  )
}

export function LabelModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => { if (product) api.getSettings().then(setSettings) }, [product])
  return (
    <Modal title="طباعة ملصق باركود" open={!!product && !!settings} onClose={onClose}>
      {product && settings && (
        <>
          <ProductHeader product={product} />
          <LabelPrint product={product} settings={settings} onPrinted={onClose} />
        </>
      )}
    </Modal>
  )
}

function ProductHeader({ product }: { product: Product }) {
  const low = product.qty <= product.min_qty
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-lg font-bold">{product.name}</div>
        <div className="text-sm text-muted">{product.category || 'بدون تصنيف'}</div>
      </div>
      <div className="flex shrink-0 gap-2 text-center">
        <div className="rounded-xl bg-indigo-50 px-3 py-1.5">
          <div className="text-[11px] text-indigo-600">السعر</div>
          <div className="num font-bold text-indigo-700">{fmt(product.price)}</div>
        </div>
        <div className={`rounded-xl px-3 py-1.5 ${low ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <div className={`text-[11px] ${low ? 'text-amber-600' : 'text-emerald-600'}`}>المتوفر</div>
          <div className={`num font-bold ${low ? 'text-amber-700' : 'text-emerald-700'}`}>{product.qty}</div>
        </div>
      </div>
    </div>
  )
}

type Scan = { n: number; code: string; product: Product | null; settings: Settings }

/**
 * What happens when a product is scanned outside the point of sale:
 * show it with a "print label" button (or print straight away if enabled in settings).
 */
export function ScanDialog() {
  const [scan, setScan] = useState<Scan | null>(null)
  const navigate = useNavigate()
  const run = useAction()

  useScanner((code) => {
    Promise.all([api.getProductByCode(code), api.getSettings()]).then(([product, settings]) => {
      setScan((s) => ({ n: (s?.n ?? 0) + 1, code, product, settings }))
      if (product?.code && settings.scan_auto_print) run(() => api.printLabel(product.id, { copies: 1 }), `تمت طباعة ملصق «${product.name}»`)
    })
  }, true, true)

  const close = () => setScan(null)
  const go = (to: string) => { close(); navigate(to) }

  return (
    <Modal title="تمت قراءة الباركود" open={!!scan} onClose={close}>
      {scan && (
        <div key={scan.n} className="scan-flash rounded-xl">
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <ScanLine size={18} />
            <span>الكود:</span>
            <span className="num font-mono font-bold">{scan.code}</span>
          </div>
          {scan.product ? (
            <>
              <ProductHeader product={scan.product} />
              <LabelPrint product={scan.product} settings={scan.settings} />
              <div className="mt-4 flex gap-2 border-t border-line pt-4">
                <Button variant="soft" className="flex-1" onClick={() => go(`/sales?add=${encodeURIComponent(scan.code)}`)}><ShoppingCart size={16} /> بيع هذا الصنف</Button>
                <Button variant="ghost" className="flex-1" onClick={() => go(`/inventory?edit=${scan.product!.id}`)}><Pencil size={16} /> تعديل الصنف</Button>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600"><PackagePlus size={28} /></div>
              <div className="font-bold">هذا الباركود غير مسجّل</div>
              <p className="mt-1 text-sm text-muted">لا يوجد صنف بهذا الكود. أضفه الآن وسيُحفظ الكود معه.</p>
              <Button className="mt-4" autoFocus onClick={() => go(`/inventory?new=${encodeURIComponent(scan.code)}`)}><PackagePlus size={16} /> إضافة صنف بهذا الباركود</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
