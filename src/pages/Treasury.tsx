import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Check, X, Wallet } from 'lucide-react'
import { api } from '../lib/api'
import { today, useLoad } from '../lib/hooks'
import { CURRENCY } from '../lib/money'
import { CHEQUE_STATUS, categoryLabel } from '../lib/labels'
import { Button, Field, IconButton, Input, Modal, Money, MoneyInput, PageTitle, Panel, Select, StatCard, Table, Tabs, useAction } from '../components/ui'
import type { ChequeInput, TreasuryInput } from '../../shared/types'

const EXPENSE_CATEGORIES = ['إيجار', 'رواتب', 'كهرباء', 'ماء', 'إنترنت وهاتف', 'نقل', 'صيانة', 'ضيافة', 'أخرى']

export default function Treasury() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cheques' ? 'cheques' : 'moves'
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageTitle>الخزينة</PageTitle>
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'moves', label: 'حركات الخزينة' }, { id: 'cheques', label: 'الشيكات' }]} />
      {tab === 'moves' ? <Moves /> : <Cheques />}
    </div>
  )
}

function Moves() {
  const [range, setRange] = useState({ from: today(), to: today() })
  const moves = useLoad(() => api.listTreasury(range), [range.from, range.to])
  const balance = useLoad(() => api.treasuryBalance())
  const [adding, setAdding] = useState<'in' | 'out' | null>(null)
  const run = useAction()
  const reload = () => { moves.reload(); balance.reload() }

  const totalIn = (moves.data ?? []).filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0)
  const totalOut = (moves.data ?? []).filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0)

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard label="رصيد الخزينة الحالي" value={<Money v={balance.data ?? 0} />} suffix={CURRENCY} icon={<Wallet size={34} className="fill-blue-500 text-blue-200" />} />
        <StatCard label="المقبوضات (الفترة)" value={<Money v={totalIn} />} suffix={CURRENCY} icon={<ArrowDownCircle size={34} className="text-emerald-400" />} />
        <StatCard label="المدفوعات (الفترة)" value={<Money v={totalOut} />} suffix={CURRENCY} icon={<ArrowUpCircle size={34} className="text-rose-400" />} />
      </div>
      <Panel title="الحركات" actions={<>
        <Button variant="success" onClick={() => setAdding('in')}><ArrowDownCircle size={16} /> قبض</Button>
        <Button variant="danger" onClick={() => setAdding('out')}><ArrowUpCircle size={16} /> مصروف / صرف</Button>
      </>}>
        <div className="mb-3 flex gap-2">
          <Field label="من تاريخ"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="إلى تاريخ"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
        <Table head={['التاريخ', 'النوع', 'التصنيف', 'البيان', 'المبلغ', '']} empty="لا توجد حركات في هذه الفترة">
          {moves.data?.map((m) => (
            <tr key={m.id}>
              <td className="num text-right text-muted">{m.created_at}</td>
              <td className={m.type === 'in' ? 'text-emerald-400' : 'text-rose-400'}>{m.type === 'in' ? 'قبض' : 'صرف'}</td>
              <td>{categoryLabel(m.category)}</td>
              <td>{m.description}</td>
              <td><Money v={m.type === 'in' ? m.amount : -m.amount} className={m.type === 'in' ? 'text-emerald-400' : 'text-rose-400'} /></td>
              <td className="w-12 text-left">
                {!m.ref && (
                  <IconButton title="حذف" onClick={async () => { if (confirm('حذف هذه الحركة؟') && (await run(() => api.deleteTreasury(m.id), 'تم الحذف'))) reload() }}>
                    <Trash2 size={15} className="text-rose-400" />
                  </IconButton>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <MoveModal type={adding} onClose={() => setAdding(null)}
        onSave={async (m) => { if (await run(() => api.addTreasury(m), 'تم تسجيل الحركة')) { setAdding(null); reload() } }} />
    </>
  )
}

function MoveModal({ type, onClose, onSave }: { type: 'in' | 'out' | null; onClose: () => void; onSave: (m: TreasuryInput) => void }) {
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  if (!type) return null
  return (
    <Modal title={type === 'in' ? 'تسجيل قبض' : 'تسجيل مصروف / صرف'} open onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onSave({ type, amount, category, description }); setAmount(0); setCategory(''); setDescription('') }}>
        <Field label={`المبلغ (${CURRENCY})`}><MoneyInput autoFocus required value={amount} onChange={setAmount} /></Field>
        <Field label="التصنيف">
          <Input required list="cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={type === 'out' ? 'مثال: إيجار، رواتب' : 'مثال: رأس مال، إيداع'} />
          <datalist id="cats">{(type === 'out' ? EXPENSE_CATEGORIES : ['رأس مال', 'إيداع', 'أخرى']).map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="البيان"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="submit" variant={type === 'in' ? 'success' : 'danger'}>حفظ</Button>
        </div>
      </form>
    </Modal>
  )
}

const EMPTY_CHEQUE: ChequeInput = { direction: 'in', number: '', bank: '', party: '', amount: 0, due_date: today(), notes: '' }

function Cheques() {
  const { data, reload } = useLoad(() => api.listCheques())
  const [form, setForm] = useState<ChequeInput | null>(null)
  const run = useAction()
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

  const setStatus = async (id: number, status: 'cleared' | 'bounced') => {
    const msg = status === 'cleared' ? 'تأكيد صرف الشيك؟ سيُسجَّل المبلغ في الخزينة.' : 'تسجيل الشيك كمرتجع؟'
    if (confirm(msg) && (await run(() => api.setChequeStatus(id, status), 'تم تحديث الشيك'))) reload()
  }

  return (
    <Panel title="الشيكات" actions={<Button onClick={() => setForm(EMPTY_CHEQUE)}><Plus size={16} /> شيك جديد</Button>}>
      <Table head={['النوع', 'رقم الشيك', 'البنك', 'الجهة', 'المبلغ', 'تاريخ الاستحقاق', 'الحالة', '']} empty="لا توجد شيكات">
        {data?.map((c) => (
          <tr key={c.id}>
            <td className={c.direction === 'in' ? 'text-emerald-400' : 'text-rose-400'}>{c.direction === 'in' ? 'وارد' : 'صادر'}</td>
            <td className="num text-right">{c.number}</td>
            <td>{c.bank}</td>
            <td>{c.party}</td>
            <td><Money v={c.amount} /></td>
            <td className={`num text-right ${c.status === 'pending' && c.due_date <= soon ? 'font-bold text-amber-400' : ''}`}>{c.due_date}</td>
            <td className={CHEQUE_STATUS[c.status].cls}>{CHEQUE_STATUS[c.status].label}</td>
            <td className="w-32 text-left">
              {c.status === 'pending' && <>
                <IconButton title="تم الصرف" onClick={() => setStatus(c.id, 'cleared')}><Check size={16} className="text-emerald-400" /></IconButton>
                <IconButton title="مرتجع" onClick={() => setStatus(c.id, 'bounced')}><X size={16} className="text-amber-400" /></IconButton>
                <IconButton title="حذف" onClick={async () => { if (confirm('حذف الشيك؟') && (await run(() => api.deleteCheque(c.id)))) reload() }}><Trash2 size={15} className="text-rose-400" /></IconButton>
              </>}
            </td>
          </tr>
        ))}
      </Table>

      <Modal title="شيك جديد" open={form !== null} onClose={() => setForm(null)}>
        {form && (
          <form className="grid grid-cols-2 gap-3" onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => api.addCheque(form), 'تمت إضافة الشيك')) { setForm(null); reload() }
          }}>
            <Field label="النوع">
              <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as 'in' | 'out' })}>
                <option value="in">وارد (من عميل)</option>
                <option value="out">صادر (لمورد)</option>
              </Select>
            </Field>
            <Field label="رقم الشيك"><Input required className="num text-right" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
            <Field label="الجهة"><Input required value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} /></Field>
            <Field label="البنك"><Input value={form.bank ?? ''} onChange={(e) => setForm({ ...form, bank: e.target.value })} /></Field>
            <Field label={`المبلغ (${CURRENCY})`}><MoneyInput required value={form.amount} onChange={(amount) => setForm({ ...form, amount })} /></Field>
            <Field label="تاريخ الاستحقاق"><Input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>إلغاء</Button>
              <Button type="submit">حفظ</Button>
            </div>
          </form>
        )}
      </Modal>
    </Panel>
  )
}
