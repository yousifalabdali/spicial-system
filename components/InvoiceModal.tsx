import { useEffect, useState } from 'react'
import { Printer, FileText, Ban, HandCoins } from 'lucide-react'
import { api } from '../lib/api'
import { fmt } from '../lib/money'
import { CHANNEL_LABEL, INVOICE_STATUS, METHOD_LABEL } from '../lib/labels'
import { Button, Field, Modal, Money, MoneyInput, Table, useAction } from './ui'
import type { InvoiceWithItems } from '../../shared/types'

export function InvoiceModal({ id, onClose, onChange }: { id: number | null; onClose: () => void; onChange?: () => void }) {
  const [inv, setInv] = useState<InvoiceWithItems | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const run = useAction()

  useEffect(() => {
    setInv(null)
    if (id) api.getInvoice(id).then((i) => { setInv(i); setPayAmount(i.total - i.paid) })
  }, [id])

  if (!id || !inv) return null
  const remaining = inv.total - inv.paid
  const update = (i: InvoiceWithItems | undefined) => {
    if (!i) return
    setInv(i)
    setPayAmount(i.total - i.paid)
    onChange?.()
  }

  return (
    <Modal title={`فاتورة ${inv.number}`} open onClose={onClose} width="max-w-2xl">
      <div className="mb-4 grid grid-cols-4 gap-3 text-sm">
        <div><div className="text-muted">العميل</div>{inv.customer_name}</div>
        <div><div className="text-muted">التاريخ</div><span className="num">{inv.created_at}</span></div>
        <div><div className="text-muted">النوع / الدفع</div>{CHANNEL_LABEL[inv.channel]} · {METHOD_LABEL[inv.payment_method]}</div>
        <div><div className="text-muted">الحالة</div><span className={INVOICE_STATUS[inv.status].cls}>{INVOICE_STATUS[inv.status].label}</span></div>
      </div>

      <Table head={['الصنف', 'الكمية', 'السعر', 'المجموع']}>
        {inv.items.map((i) => (
          <tr key={i.id}><td>{i.name}</td><td className="num text-right">{i.qty}</td><td><Money v={i.price} /></td><td><Money v={i.total} /></td></tr>
        ))}
      </Table>

      <div className="mt-4 mr-auto w-72 space-y-1 text-sm">
        <Row label="المجموع" v={inv.subtotal} />
        {inv.discount > 0 && <Row label="الخصم" v={-inv.discount} />}
        {inv.vat > 0 && <Row label={`الضريبة ${inv.vat_rate}%`} v={inv.vat} />}
        <Row label="الإجمالي" v={inv.total} bold />
        <Row label="المدفوع" v={inv.paid} />
        {remaining > 0 && inv.status !== 'cancelled' && <Row label="المتبقي" v={remaining} className="text-rose-400" />}
      </div>

      {remaining > 0 && inv.status !== 'cancelled' && (
        <div className="mt-4 flex items-end gap-2 rounded-lg border border-line bg-panel-2/50 p-3">
          <Field label="تحصيل دفعة (ر.ع)" className="flex-1">
            <MoneyInput value={payAmount} onChange={setPayAmount} />
          </Field>
          <Button variant="success" onClick={async () => update(await run(() => api.payInvoice(inv.id, payAmount), 'تم تسجيل الدفعة'))}>
            <HandCoins size={16} /> تحصيل
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button onClick={() => run(() => api.printInvoice(inv.id))}><Printer size={16} /> طباعة</Button>
          <Button variant="ghost" onClick={() => run(() => api.printInvoice(inv.id, { paper: '80mm', pdf: true }))}><FileText size={16} /> PDF حراري</Button>
          <Button variant="ghost" onClick={() => run(() => api.printInvoice(inv.id, { paper: 'A4', pdf: true }))}><FileText size={16} /> PDF A4</Button>
        </div>
        {inv.status !== 'cancelled' && (
          <Button variant="danger" onClick={async () => {
            if (!confirm(`إلغاء الفاتورة ${inv.number}؟ سيتم إرجاع الكميات للمخزون واسترجاع المبلغ المدفوع.`)) return
            update(await run(() => api.cancelInvoice(inv.id), 'تم إلغاء الفاتورة'))
          }}><Ban size={16} /> إلغاء الفاتورة</Button>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, v, bold, className = '' }: { label: string; v: number; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-line pt-1 text-base font-bold' : ''} ${className}`}>
      <span>{label}</span><span className="num">{fmt(v)}</span>
    </div>
  )
}
