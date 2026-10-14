import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, AlertTriangle, Barcode, Wand2, ScanBarcode } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { CURRENCY } from '../lib/money'
import { useScanner } from '../lib/scanner'
import { generateEan13, isEncodable } from '../../shared/barcode'
import { Button, Field, IconButton, Input, Modal, Money, MoneyInput, PageTitle, Panel, Table, useAction, useToast } from '../components/ui'
import { BarcodeView, LabelModal } from '../components/Barcode'
import { ImagePicker, ProductImage, forgetProductImage } from '../components/ProductImage'
import { STOCK_CHANGED } from '../components/StockAlerts'
import type { Product, ProductInput } from '../../shared/types'

const EMPTY: ProductInput = { name: '', code: '', category: '', unit: 'حبة', cost: 0, price: 0, qty: 0, min_qty: 0 }

export default function Inventory() {
  const [params, setParams] = useSearchParams()
  const { data, reload } = useLoad(() => api.listProducts())
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1')
  const [editing, setEditing] = useState<Product | ProductInput | null>(null)
  const [label, setLabel] = useState<Product | null>(null)
  const run = useAction()

  // Opened from the scan dialog: ?new=<code> adds a product with that barcode, ?edit=<id> edits one.
  useEffect(() => {
    const editId = Number(params.get('edit'))
    if (params.has('new')) setEditing({ ...EMPTY, code: params.get('new') ?? '' })
    else if (editId && data) { const p = data.find((x) => x.id === editId); if (p) setEditing(p) }
    else return
    setParams({}, { replace: true })
  }, [params, data, setParams])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((p) =>
      (!lowOnly || p.qty <= p.min_qty) &&
      (!q || p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)))
  }, [data, search, lowOnly])

  const lowCount = (data ?? []).filter((p) => p.qty <= p.min_qty).length
  const stockValue = rows.reduce((s, p) => s + p.qty * p.cost, 0)

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageTitle actions={<Button onClick={() => setEditing(EMPTY)}><Plus size={16} /> صنف جديد</Button>}>المخزون</PageTitle>
      <Panel>
        <div className="flex items-center gap-3 pt-5 pb-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-2.5 right-3 text-muted" />
            <Input className="pr-10" placeholder="بحث بالاسم أو الكود أو التصنيف" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={lowOnly ? 'primary' : 'ghost'} onClick={() => setLowOnly((v) => !v)}>
            <AlertTriangle size={16} /> منخفضة المخزون (<span className="num">{lowCount}</span>)
          </Button>
        </div>
        <Table head={['الصنف', 'الباركود', 'التصنيف', 'سعر الشراء', 'سعر البيع', 'الكمية', 'حد التنبيه', 'القيمة', '']} empty="لا توجد أصناف">
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-2.5">
                  <ProductImage id={p.id} hasImage={p.has_image} className="h-9 w-9 shrink-0 rounded-lg" iconSize={15} />
                  <span className="font-semibold">{p.name}</span>
                </div>
              </td>
              <td className="num text-right text-muted">{p.code || <span className="text-slate-300">—</span>}</td>
              <td>{p.category && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{p.category}</span>}</td>
              <td><Money v={p.cost} /></td>
              <td><Money v={p.price} className="font-semibold" /></td>
              <td>
                <span className={`num inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 font-bold ${p.qty <= p.min_qty ? 'bg-amber-50 text-amber-700' : 'text-ink'}`}>
                  {p.qty} <span className="text-xs font-normal text-muted">{p.unit}</span>
                </span>
              </td>
              <td className="num text-right text-muted">{p.min_qty}</td>
              <td><Money v={p.qty * p.cost} /></td>
              <td className="w-32 text-left whitespace-nowrap">
                <IconButton title="طباعة ملصق الباركود" onClick={() => (p.code ? setLabel(p) : setEditing(p))}><Barcode size={16} className="text-accent" /></IconButton>
                <IconButton title="تعديل" onClick={() => setEditing(p)}><Pencil size={15} /></IconButton>
                <IconButton title="حذف" onClick={async () => { if (confirm(`حذف الصنف «${p.name}»؟`) && (await run(() => api.deleteProduct(p.id), 'تم حذف الصنف'))) reload() }}>
                  <Trash2 size={15} className="text-rose-500" />
                </IconButton>
              </td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 text-sm text-muted">
          عدد الأصناف: <span className="num">{rows.length}</span> · قيمة المخزون (بسعر الشراء): <Money v={stockValue} className="text-ink" /> {CURRENCY}
        </div>
      </Panel>

      <ProductModal product={editing} onClose={() => setEditing(null)}
        onSave={async (p, printLabel) => {
          const saved = await run(() => api.saveProduct(p), 'تم حفظ الصنف')
          if (!saved) return
          forgetProductImage(saved.id)
          window.dispatchEvent(new Event(STOCK_CHANGED))
          setEditing(null); reload()
          if (printLabel && saved.code) setLabel(saved)
        }} />
      <LabelModal product={label} onClose={() => setLabel(null)} />
    </div>
  )
}

function ProductModal({ product, onClose, onSave }: { product: Product | ProductInput | null; onClose: () => void; onSave: (p: ProductInput & { id?: number }, printLabel: boolean) => void }) {
  const [form, setForm] = useState<ProductInput>(EMPTY)
  const toast = useToast()
  const id = product && 'id' in product ? product.id : undefined
  const hasImage = product && 'has_image' in product ? product.has_image : 0
  useEffect(() => { if (product) setForm({ ...product, image: undefined }) }, [product])
  const text = (k: keyof ProductInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const int = (k: keyof ProductInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: parseInt(e.target.value) || 0 })
  const margin = form.price - form.cost
  const code = form.code?.trim() ?? ''

  // While this form is open, a scan fills the barcode field.
  useScanner((scanned) => setForm((f) => ({ ...f, code: scanned })), product !== null)

  const submit = (printLabel: boolean) => onSave({ ...form, id }, printLabel)

  return (
    <Modal title={id ? 'تعديل الصنف' : 'صنف جديد'} open={product !== null} onClose={onClose} width="max-w-2xl">
      <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(false) }}>
        <Field label="اسم الصنف" className="col-span-2"><Input autoFocus={!form.name} required value={form.name} onChange={text('name')} /></Field>

        <div className="col-span-2">
          <ImagePicker productId={id} hasImage={hasImage} value={form.image} onChange={(image) => setForm((f) => ({ ...f, image }))} onError={(m) => toast(m, 'error')} />
        </div>

        <div className="col-span-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex items-end gap-2">
            <Field label="الباركود" className="flex-1">
              <div className="relative">
                <ScanBarcode size={18} className="absolute top-2.5 right-3 text-indigo-400" />
                <Input className="num pr-10 text-right" placeholder="امسح المنتج بالقارئ أو اكتب الكود" value={form.code ?? ''} onChange={text('code')} />
              </div>
            </Field>
            <Button type="button" variant="soft" title="إنشاء باركود جديد للصنف" onClick={() => setForm({ ...form, code: generateEan13() })}><Wand2 size={16} /> توليد</Button>
          </div>
          {code && (
            isEncodable(code)
              ? <div className="mt-3 rounded-lg bg-white p-2"><BarcodeView code={code} className="mx-auto h-12 max-w-72" /></div>
              : <p className="mt-2 text-xs text-rose-600">لا يمكن طباعة هذا الكود كباركود: استخدم أرقاماً أو حروفاً إنجليزية فقط.</p>
          )}
        </div>

        <Field label="التصنيف"><Input value={form.category ?? ''} onChange={text('category')} /></Field>
        <Field label="الوحدة"><Input value={form.unit} onChange={text('unit')} /></Field>
        <Field label={`سعر الشراء (${CURRENCY})`}><MoneyInput value={form.cost} onChange={(cost) => setForm({ ...form, cost })} /></Field>
        <Field label={`سعر البيع (${CURRENCY})`}><MoneyInput value={form.price} onChange={(price) => setForm({ ...form, price })} /></Field>
        <Field label="الكمية الحالية"><Input type="number" className="num text-right" value={form.qty} onChange={int('qty')} /></Field>
        <Field label="حد التنبيه (أقل كمية)"><Input type="number" min="0" className="num text-right" value={form.min_qty} onChange={int('min_qty')} /></Field>
        <div className="col-span-2 text-sm text-muted">
          الربح للوحدة:&nbsp;<Money v={margin} className={`font-bold ${margin < 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
        </div>
        <div className="col-span-2 mt-1 flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="button" variant="soft" disabled={!code || !isEncodable(code)} onClick={() => submit(true)}><Barcode size={16} /> حفظ وطباعة ملصق</Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Modal>
  )
}
