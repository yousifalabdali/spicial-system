import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Trash2, Plus, Minus, Save, Printer, Pencil, UserPlus, ScanBarcode, ShoppingBag } from 'lucide-react'
import { api } from '../lib/api'
import { useLoad } from '../lib/hooks'
import { useScanner } from '../lib/scanner'
import { calcTotals, fmt, CURRENCY } from '../lib/money'
import { CHANNEL_LABEL, INVOICE_STATUS, METHOD_LABEL } from '../lib/labels'
import { Button, Field, IconButton, Input, Money, MoneyInput, Panel, Select, Table, Tabs, useAction, useToast } from '../components/ui'
import { InvoiceModal } from '../components/InvoiceModal'
import { PartyModal } from '../components/PartyModal'
import type { Channel, Customer, PaymentMethod, Product } from '../../shared/types'

type Tab = 'pos' | 'invoices' | 'customers'

export default function Sales() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'pos'
  return (
    <div className="mx-auto max-w-[1400px]">
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[
        { id: 'pos', label: 'نقطة البيع' },
        { id: 'invoices', label: 'الفواتير' },
        { id: 'customers', label: 'العملاء' },
      ]} />
      {tab === 'pos' && <Pos />}
      {tab === 'invoices' && <Invoices initialStatus={params.get('status') ?? ''} openId={Number(params.get('open')) || null} />}
      {tab === 'customers' && <Customers />}
    </div>
  )
}

// ---------------- Point of sale ----------------

type CartLine = { product: Product; qty: number; price: number }

function Pos() {
  const products = useLoad(() => api.listProducts())
  const customers = useLoad(() => api.listCustomers())
  const settings = useLoad(() => api.getSettings())
  const run = useAction()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [flash, setFlash] = useState<{ id: number; n: number } | null>(null)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [channel, setChannel] = useState<Channel>('retail')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [discount, setDiscount] = useState(0)
  const [paid, setPaid] = useState(0)
  const [newCustomer, setNewCustomer] = useState(false)
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = products.data ?? []
    if (!q) return list
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
  }, [products.data, search])

  const add = (p: Product) => {
    setCart((c) => {
      const line = c.find((l) => l.product.id === p.id)
      if (line) return c.map((l) => (l === line ? { ...l, qty: Math.min(l.qty + 1, p.qty) } : l))
      return [...c, { product: p, qty: 1, price: p.price }]
    })
    setFlash((f) => ({ id: p.id, n: (f?.n ?? 0) + 1 }))
    setSearch('')
    searchRef.current?.focus()
  }

  // A scanned barcode goes straight into the cart.
  const addByCode = (code: string) => {
    const p = products.data?.find((x) => x.code === code)
    if (!p) return toast(`الباركود ${code} غير مسجّل. أضفه من شاشة المخزون`, 'error')
    if (p.qty <= 0) return toast(`«${p.name}» نفد من المخزون`, 'error')
    add(p)
  }
  useScanner(addByCode)

  // Arriving from the scan dialog's "sell this item" button.
  const pendingAdd = params.get('add')
  useEffect(() => {
    if (!pendingAdd || !products.data) return
    addByCode(pendingAdd)
    setParams({ tab: 'pos' }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAdd, products.data])

  const setLine = (id: number, patch: Partial<CartLine>) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, ...patch } : l)))

  const vatRate = settings.data?.vat_enabled ? settings.data.vat_rate : 0
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0)
  const totals = calcTotals(subtotal, discount, vatRate)

  const reset = () => {
    setCart([]); setDiscount(0); setPaid(0); setCustomerId(null); setMethod('cash'); setChannel('retail')
    products.reload(); customers.reload()
    searchRef.current?.focus()
  }

  const save = async (print: boolean) => {
    setSaving(true)
    const inv = await run(() => api.createInvoice({
      customer_id: customerId,
      channel,
      items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, price: l.price })),
      discount: totals.discount,
      paid: method === 'credit' ? paid : totals.total,
      payment_method: method,
      due_date: null,
      notes: null,
    }), 'تم حفظ الفاتورة')
    setSaving(false)
    if (!inv) return
    reset()
    if (print) run(() => api.printInvoice(inv.id))
  }

  return (
    <div className="grid grid-cols-[1fr_440px] gap-4">
      <Panel title="الأصناف">
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
          <ScanBarcode size={18} className="shrink-0" />
          امسح باركود المنتج بالقارئ ليُضاف للفاتورة مباشرة، أو اضغط على الصنف
        </div>
        <div className="relative mb-3">
          <Search size={18} className="absolute top-2.5 right-3 text-muted" />
          <Input ref={searchRef} autoFocus className="pr-10" placeholder="ابحث بالاسم أو الكود (Enter لإضافة أول نتيجة)" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const exact = products.data?.find((p) => p.code && p.code === search.trim())
              const pick = exact ?? (filtered.length ? filtered[0] : undefined)
              if (pick) add(pick)
            }} />
        </div>
        <div className="grid max-h-[calc(100vh-300px)] grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 overflow-auto p-0.5 pl-1">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => add(p)} disabled={p.qty <= 0}
              className="group rounded-xl border border-line bg-white p-3 text-right transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/10 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none">
              <div className="line-clamp-2 min-h-10 text-sm font-semibold">{p.name}</div>
              <div className="mt-2 flex items-end justify-between">
                <span className="num rounded-lg bg-indigo-50 px-2 py-0.5 font-bold text-accent">{fmt(p.price)}</span>
                <span className={`text-xs ${p.qty <= p.min_qty ? 'font-semibold text-amber-600' : 'text-muted'}`}>متوفر <span className="num">{p.qty}</span></span>
              </div>
            </button>
          ))}
          {!filtered.length && <div className="col-span-full py-10 text-center text-muted">لا توجد أصناف مطابقة</div>}
        </div>
      </Panel>

      <Panel title="الفاتورة" className="flex flex-col">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="العميل">
            <div className="flex gap-1">
              <Select value={customerId ?? ''} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">عميل نقدي</option>
                {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <IconButton title="عميل جديد" onClick={() => setNewCustomer(true)}><UserPlus size={18} /></IconButton>
            </div>
          </Field>
          <Field label="نوع البيع">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>

        <div className="max-h-[calc(100vh-560px)] min-h-32 overflow-auto rounded-xl border border-line">
          {cart.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted">
              <ShoppingBag size={30} className="text-slate-300" />
              امسح منتجاً أو اختر من الأصناف
            </div>
          )}
          {cart.map((l) => (
            <div key={flash?.id === l.product.id ? `${l.product.id}-${flash.n}` : l.product.id}
              className={`flex items-center gap-2 border-b border-line px-2.5 py-2 text-sm last:border-0 ${flash?.id === l.product.id ? 'scan-flash bg-emerald-50/60' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.product.name}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                  السعر
                  <MoneyInput className="!w-24 !px-1.5 !py-0.5" value={l.price} onChange={(price) => setLine(l.product.id, { price })} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <IconButton title="زيادة" onClick={() => setLine(l.product.id, { qty: Math.min(l.qty + 1, l.product.qty) })}><Plus size={15} /></IconButton>
                <input className="num w-12 rounded-lg border border-line bg-white py-0.5 text-center outline-none focus:border-accent" value={l.qty}
                  onChange={(e) => setLine(l.product.id, { qty: Math.max(0, parseInt(e.target.value) || 0) })} />
                <IconButton title="إنقاص" onClick={() => setLine(l.product.id, { qty: Math.max(1, l.qty - 1) })}><Minus size={15} /></IconButton>
              </div>
              <span className="num w-20 text-left font-semibold">{fmt(l.qty * l.price)}</span>
              <IconButton title="حذف" onClick={() => setCart((c) => c.filter((x) => x !== l))}><Trash2 size={15} className="text-rose-600" /></IconButton>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label={`الخصم (${CURRENCY})`}>
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>
          <Field label="طريقة الدفع">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {method === 'credit' && (
            <Field label={`المدفوع الآن (${CURRENCY})`} className="col-span-2">
              <MoneyInput value={paid} onChange={setPaid} />
            </Field>
          )}
        </div>

        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-muted"><span>المجموع</span><Money v={subtotal} className="text-ink" /></div>
          {totals.discount > 0 && <div className="flex justify-between text-muted"><span>الخصم</span><Money v={-totals.discount} className="text-ink" /></div>}
          {vatRate > 0 && <div className="flex justify-between text-muted"><span>ضريبة القيمة المضافة {vatRate}%</span><Money v={totals.vat} className="text-ink" /></div>}
          <div className="mt-1 flex items-center justify-between rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-3 text-white">
            <span className="font-semibold">الإجمالي</span><span className="text-2xl font-bold"><Money v={totals.total} /> <span className="text-sm font-semibold opacity-80">{CURRENCY}</span></span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="success" className="py-3 text-base" disabled={!cart.length || saving} onClick={() => save(true)}><Printer size={18} /> حفظ وطباعة</Button>
          <Button className="py-3 text-base" disabled={!cart.length || saving} onClick={() => save(false)}><Save size={18} /> حفظ</Button>
        </div>
      </Panel>

      <PartyModal title="عميل جديد" open={newCustomer} party={null} onClose={() => setNewCustomer(false)}
        onSave={async (p) => {
          const id = await run(() => api.saveCustomer(p), 'تمت إضافة العميل')
          if (!id) return
          setNewCustomer(false)
          customers.reload()
          setCustomerId(id)
        }} />
    </div>
  )
}

// ---------------- Invoices list ----------------

function Invoices({ initialStatus, openId }: { initialStatus: string; openId: number | null }) {
  const [filter, setFilter] = useState({ from: '', to: '', search: '', status: initialStatus })
  const [open, setOpen] = useState<number | null>(openId)
  const { data, reload } = useLoad(() => api.listInvoices(filter), [filter.from, filter.to, filter.search, filter.status])
  const set = (k: keyof typeof filter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilter({ ...filter, [k]: e.target.value })
  const sum = (data ?? []).filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.total, 0)

  return (
    <Panel>
      <div className="mb-3 grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 pt-4">
        <Field label="بحث"><Input placeholder="رقم الفاتورة أو اسم العميل" value={filter.search} onChange={set('search')} /></Field>
        <Field label="من تاريخ"><Input type="date" value={filter.from} onChange={set('from')} /></Field>
        <Field label="إلى تاريخ"><Input type="date" value={filter.to} onChange={set('to')} /></Field>
        <Field label="الحالة">
          <Select value={filter.status} onChange={set('status')}>
            <option value="">الكل</option>
            <option value="due">مستحقة الدفع</option>
            {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
      </div>
      <Table head={['رقم الفاتورة', 'التاريخ', 'العميل', 'النوع', 'الإجمالي', 'المدفوع', 'الحالة']} empty="لا توجد فواتير">
        {data?.map((inv) => (
          <tr key={inv.id} className="cursor-pointer" onClick={() => setOpen(inv.id)}>
            <td className="num text-right">{inv.number}</td>
            <td className="num text-right text-muted">{inv.created_at}</td>
            <td>{inv.customer_name}</td>
            <td>{CHANNEL_LABEL[inv.channel]}</td>
            <td><Money v={inv.total} /></td>
            <td><Money v={inv.paid} /></td>
            <td className={INVOICE_STATUS[inv.status].cls}>{INVOICE_STATUS[inv.status].label}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 text-sm text-muted">عدد الفواتير: <span className="num">{data?.length ?? 0}</span> · الإجمالي (بدون الملغاة): <Money v={sum} className="text-ink" /> {CURRENCY}</div>
      <InvoiceModal id={open} onClose={() => setOpen(null)} onChange={reload} />
    </Panel>
  )
}

// ---------------- Customers ----------------

function Customers() {
  const { data, reload } = useLoad(() => api.listCustomers())
  const [editing, setEditing] = useState<Customer | null | 'new'>(null)
  const run = useAction()

  return (
    <Panel title="العملاء" actions={<Button onClick={() => setEditing('new')}><UserPlus size={16} /> عميل جديد</Button>}>
      <Table head={['الاسم', 'الهاتف', 'العنوان', 'الرصيد المستحق', '']} empty="لا يوجد عملاء">
        {data?.map((c) => (
          <tr key={c.id}>
            <td className="font-semibold">{c.name}</td>
            <td className="num text-right">{c.phone}</td>
            <td>{c.address}</td>
            <td><Money v={c.balance} className={c.balance > 0 ? 'text-rose-600' : 'text-muted'} /></td>
            <td className="w-24 text-left">
              <IconButton title="تعديل" onClick={() => setEditing(c)}><Pencil size={15} /></IconButton>
              <IconButton title="حذف" onClick={async () => { if (confirm(`حذف العميل ${c.name}؟`) && (await run(() => api.deleteCustomer(c.id), 'تم الحذف'))) reload() }}>
                <Trash2 size={15} className="text-rose-600" />
              </IconButton>
            </td>
          </tr>
        ))}
      </Table>
      <PartyModal title={editing === 'new' ? 'عميل جديد' : 'تعديل العميل'} open={editing !== null} party={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={async (p) => { if (await run(() => api.saveCustomer(p), 'تم الحفظ')) { setEditing(null); reload() } }} />
    </Panel>
  )
}
