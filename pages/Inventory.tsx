import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { CURRENCY } from '../lib/money'
import { Button, Field, IconButton, Input, Modal, Money, MoneyInput, PageTitle, Panel, Table, useAction } from '../components/ui'
import type { Product, ProductInput } from '../../shared/types'

const EMPTY: ProductInput = { name: '', code: '', category: '', unit: 'حبة', cost: 0, price: 0, qty: 0, min_qty: 0 }

export default function Inventory() {
  const [params] = useSearchParams()
  const { data, reload } = useLoad(() => api.listProducts())
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1')
  const [editing, setEditing] = useState<Product | null | 'new'>(null)
  const run = useAction()

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
      <PageTitle actions={<Button onClick={() => setEditing('new')}><Plus size={16} /> صنف جديد</Button>}>المخزون</PageTitle>
      <Panel>
        <div className="flex items-center gap-3 pt-4 pb-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-2.5 right-3 text-muted" />
            <Input className="pr-10" placeholder="بحث بالاسم أو الكود أو التصنيف" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={lowOnly ? 'primary' : 'ghost'} onClick={() => setLowOnly((v) => !v)}>
            <AlertTriangle size={16} /> منخفضة المخزون (<span className="num">{lowCount}</span>)
          </Button>
        </div>
        <Table head={['الصنف', 'الكود', 'التصنيف', 'سعر الشراء', 'سعر البيع', 'الكمية', 'حد التنبيه', 'القيمة', '']} empty="لا توجد أصناف">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="font-semibold">{p.name}</td>
              <td className="num text-right text-muted">{p.code}</td>
              <td>{p.category}</td>
              <td><Money v={p.cost} /></td>
              <td><Money v={p.price} /></td>
              <td className={`num text-right font-bold ${p.qty <= p.min_qty ? 'text-amber-400' : ''}`}>{p.qty} <span className="text-xs font-normal text-muted">{p.unit}</span></td>
              <td className="num text-right text-muted">{p.min_qty}</td>
              <td><Money v={p.qty * p.cost} /></td>
              <td className="w-24 text-left">
                <IconButton title="تعديل" onClick={() => setEditing(p)}><Pencil size={15} /></IconButton>
                <IconButton title="حذف" onClick={async () => { if (confirm(`حذف الصنف «${p.name}»؟`) && (await run(() => api.deleteProduct(p.id), 'تم حذف الصنف'))) reload() }}>
                  <Trash2 size={15} className="text-rose-400" />
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
        onSave={async (p) => { if (await run(() => api.saveProduct(p), 'تم حفظ الصنف')) { setEditing(null); reload() } }} />
    </div>
  )
}

function ProductModal({ product, onClose, onSave }: { product: Product | null | 'new'; onClose: () => void; onSave: (p: ProductInput & { id?: number }) => void }) {
  const [form, setForm] = useState<ProductInput>(EMPTY)
  useEffect(() => { if (product) setForm(product === 'new' ? EMPTY : product) }, [product])
  const text = (k: keyof ProductInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const int = (k: keyof ProductInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: parseInt(e.target.value) || 0 })
  const margin = form.price - form.cost

  return (
    <Modal title={product === 'new' ? 'صنف جديد' : 'تعديل الصنف'} open={product !== null} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, id: product && product !== 'new' ? product.id : undefined }) }}>
        <Field label="اسم الصنف" className="col-span-2"><Input autoFocus required value={form.name} onChange={text('name')} /></Field>
        <Field label="الكود / الباركود"><Input className="num text-right" value={form.code ?? ''} onChange={text('code')} /></Field>
        <Field label="التصنيف"><Input value={form.category ?? ''} onChange={text('category')} /></Field>
        <Field label={`سعر الشراء (${CURRENCY})`}><MoneyInput value={form.cost} onChange={(cost) => setForm({ ...form, cost })} /></Field>
        <Field label={`سعر البيع (${CURRENCY})`}><MoneyInput value={form.price} onChange={(price) => setForm({ ...form, price })} /></Field>
        <Field label="الكمية الحالية"><Input type="number" className="num text-right" value={form.qty} onChange={int('qty')} /></Field>
        <Field label="الوحدة"><Input value={form.unit} onChange={text('unit')} /></Field>
        <Field label="حد التنبيه (أقل كمية)"><Input type="number" min="0" className="num text-right" value={form.min_qty} onChange={int('min_qty')} /></Field>
        <div className="flex items-end pb-2 text-sm text-muted">
          الربح للوحدة:&nbsp;<Money v={margin} className={margin < 0 ? 'text-rose-400' : 'text-emerald-400'} />
        </div>
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Modal>
  )
}
