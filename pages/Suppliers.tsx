import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, PackageCheck, Ban, HandCoins } from 'lucide-react'
import { api } from '../lib/api'
import { today, useLoad } from '../lib/hooks'
import { fmt, CURRENCY } from '../lib/money'
import { PURCHASE_STATUS } from '../lib/labels'
import { Button, Field, IconButton, Input, Modal, Money, MoneyInput, PageTitle, Panel, Select, Table, Tabs, useAction } from '../components/ui'
import { PartyModal } from '../components/PartyModal'
import type { Product, PurchaseOrderWithItems, Supplier } from '../../shared/types'

export default function Suppliers() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'orders' ? 'orders' : 'suppliers'
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageTitle>الموردين والمشتريات</PageTitle>
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'suppliers', label: 'الموردين' }, { id: 'orders', label: 'أوامر الشراء' }]} />
      {tab === 'suppliers' ? <SupplierList /> : <Orders />}
    </div>
  )
}

function SupplierList() {
  const { data, reload } = useLoad(() => api.listSuppliers())
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null)
  const run = useAction()
  return (
    <Panel title="الموردين" actions={<Button onClick={() => setEditing('new')}><Plus size={16} /> مورد جديد</Button>}>
      <Table head={['الاسم', 'الهاتف', 'العنوان', 'المستحق للمورد', '']} empty="لا يوجد موردون">
        {data?.map((s) => (
          <tr key={s.id}>
            <td className="font-semibold">{s.name}</td>
            <td className="num text-right">{s.phone}</td>
            <td>{s.address}</td>
            <td><Money v={s.balance} className={s.balance > 0 ? 'text-rose-400' : 'text-muted'} /></td>
            <td className="w-24 text-left">
              <IconButton title="تعديل" onClick={() => setEditing(s)}><Pencil size={15} /></IconButton>
              <IconButton title="حذف" onClick={async () => { if (confirm(`حذف المورد ${s.name}؟`) && (await run(() => api.deleteSupplier(s.id), 'تم الحذف'))) reload() }}>
                <Trash2 size={15} className="text-rose-400" />
              </IconButton>
            </td>
          </tr>
        ))}
      </Table>
      <PartyModal title={editing === 'new' ? 'مورد جديد' : 'تعديل المورد'} open={editing !== null} party={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={async (p) => { if (await run(() => api.saveSupplier(p), 'تم الحفظ')) { setEditing(null); reload() } }} />
    </Panel>
  )
}

function Orders() {
  const [status, setStatus] = useState('')
  const { data, reload } = useLoad(() => api.listPurchases({ status }), [status])
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const run = useAction()
  const now = today()

  return (
    <Panel title="أوامر الشراء" actions={<>
      <Select className="!w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">الكل</option>
        {Object.entries(PURCHASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Select>
      <Button onClick={() => setCreating(true)}><Plus size={16} /> أمر شراء جديد</Button>
    </>}>
      <Table head={['الرقم', 'التاريخ', 'المورد', 'الإجمالي', 'المدفوع', 'موعد التوريد', 'الحالة']} empty="لا توجد أوامر شراء">
        {data?.map((po) => {
          const late = po.status === 'pending' && po.expected_date && po.expected_date < now
          return (
            <tr key={po.id} className="cursor-pointer" onClick={() => setOpen(po.id)}>
              <td className="num text-right">{po.number}</td>
              <td className="num text-right text-muted">{po.created_at.slice(0, 10)}</td>
              <td>{po.supplier_name}</td>
              <td><Money v={po.total} /></td>
              <td><Money v={po.paid} /></td>
              <td className={`num text-right ${late ? 'font-bold text-rose-400' : ''}`}>{po.expected_date ?? '—'}{late && ' (متأخر)'}</td>
              <td className={PURCHASE_STATUS[po.status].cls}>{PURCHASE_STATUS[po.status].label}</td>
            </tr>
          )
        })}
      </Table>
      <NewOrderModal open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} run={run} />
      <OrderModal id={open} onClose={() => setOpen(null)} onChange={reload} />
    </Panel>
  )
}

type Line = { product_id: number; qty: number; cost: number }

function NewOrderModal({ open, onClose, onSaved, run }: { open: boolean; onClose: () => void; onSaved: () => void; run: ReturnType<typeof useAction> }) {
  const suppliers = useLoad(() => api.listSuppliers(), [open])
  const products = useLoad(() => api.listProducts(), [open])
  const [supplierId, setSupplierId] = useState(0)
  const [expected, setExpected] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  useEffect(() => { if (open) { setLines([]); setExpected(''); setSupplierId(0) } }, [open])

  const byId = new Map((products.data ?? []).map((p) => [p.id, p]))
  const addLine = (p: Product) => setLines((l) => (l.some((x) => x.product_id === p.id) ? l : [...l, { product_id: p.id, qty: 1, cost: p.cost }]))
  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0)

  return (
    <Modal title="أمر شراء جديد" open={open} onClose={onClose} width="max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <Field label="المورد">
          <Select value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))}>
            <option value={0}>— اختر المورد —</option>
            {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="موعد التوريد المتوقع"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
        <Field label="إضافة صنف">
          <Select value="" onChange={(e) => { const p = byId.get(Number(e.target.value)); if (p) addLine(p) }}>
            <option value="">— اختر صنفاً —</option>
            {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} (متوفر {p.qty})</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-4">
        <Table head={['الصنف', 'الكمية', `سعر الشراء (${CURRENCY})`, 'المجموع', '']} empty="أضف الأصناف المطلوبة">
          {lines.map((l, i) => (
            <tr key={l.product_id}>
              <td>{byId.get(l.product_id)?.name}</td>
              <td><Input type="number" min="1" className="num !w-24 text-right" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: parseInt(e.target.value) || 0 } : x)))} /></td>
              <td><MoneyInput className="!w-32" value={l.cost} onChange={(cost) => setLines(lines.map((x, j) => (j === i ? { ...x, cost } : x)))} /></td>
              <td><Money v={l.qty * l.cost} /></td>
              <td className="w-10"><IconButton title="حذف" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={15} className="text-rose-400" /></IconButton></td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-lg font-bold">الإجمالي: <span className="num">{fmt(total)}</span> {CURRENCY}</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button disabled={!supplierId || !lines.length} onClick={async () => {
            if (await run(() => api.createPurchase({ supplier_id: supplierId, items: lines, expected_date: expected || null, notes: null }), 'تم إنشاء أمر الشراء')) onSaved()
          }}>حفظ أمر الشراء</Button>
        </div>
      </div>
    </Modal>
  )
}

function OrderModal({ id, onClose, onChange }: { id: number | null; onClose: () => void; onChange: () => void }) {
  const [po, setPo] = useState<PurchaseOrderWithItems | null>(null)
  const [amount, setAmount] = useState(0)
  const run = useAction()
  useEffect(() => {
    setPo(null)
    if (id) api.getPurchase(id).then((p) => { setPo(p); setAmount(p.status === 'pending' ? p.total : p.total - p.paid) })
  }, [id])
  if (!id || !po) return null
  const update = (p: PurchaseOrderWithItems | undefined) => { if (p) { setPo(p); setAmount(p.total - p.paid); onChange() } }
  const remaining = po.total - po.paid

  return (
    <Modal title={`أمر شراء ${po.number}`} open onClose={onClose} width="max-w-2xl">
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div><div className="text-muted">المورد</div>{po.supplier_name}</div>
        <div><div className="text-muted">التاريخ</div><span className="num">{po.created_at}</span></div>
        <div><div className="text-muted">الحالة</div><span className={PURCHASE_STATUS[po.status].cls}>{PURCHASE_STATUS[po.status].label}</span></div>
      </div>
      <Table head={['الصنف', 'الكمية', 'سعر الشراء', 'المجموع']}>
        {po.items.map((i) => <tr key={i.id}><td>{i.name}</td><td className="num text-right">{i.qty}</td><td><Money v={i.cost} /></td><td><Money v={i.total} /></td></tr>)}
      </Table>
      <div className="mt-3 text-sm">
        الإجمالي: <Money v={po.total} className="font-bold" /> · المدفوع: <Money v={po.paid} />
        {po.status === 'received' && remaining > 0 && <> · المتبقي: <Money v={remaining} className="text-rose-400" /></>}
      </div>

      {po.status === 'pending' && (
        <div className="mt-4 flex items-end gap-2 rounded-lg border border-line bg-panel-2/50 p-3">
          <Field label={`المدفوع عند الاستلام (${CURRENCY})`} className="flex-1"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Button variant="success" onClick={async () => update(await run(() => api.receivePurchase(po.id, amount), 'تم الاستلام وإضافة الكميات للمخزون'))}>
            <PackageCheck size={16} /> استلام البضاعة
          </Button>
          <Button variant="danger" onClick={async () => { if (confirm('إلغاء أمر الشراء؟')) update(await run(() => api.cancelPurchase(po.id), 'تم الإلغاء')) }}>
            <Ban size={16} /> إلغاء
          </Button>
        </div>
      )}
      {po.status === 'received' && remaining > 0 && (
        <div className="mt-4 flex items-end gap-2 rounded-lg border border-line bg-panel-2/50 p-3">
          <Field label={`دفعة للمورد (${CURRENCY})`} className="flex-1"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Button onClick={async () => update(await run(() => api.payPurchase(po.id, amount), 'تم تسجيل الدفعة'))}><HandCoins size={16} /> تسديد</Button>
        </div>
      )}
    </Modal>
  )
}
