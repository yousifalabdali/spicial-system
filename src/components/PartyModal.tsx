import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal } from './ui'
import type { Party, PartyInput } from '../../shared/types'

const EMPTY: PartyInput = { name: '', phone: '', address: '', notes: '' }

/** Add/edit form shared by customers and suppliers. */
export function PartyModal({ title, open, party, onClose, onSave }: {
  title: string
  open: boolean
  party: Party | null
  onClose: () => void
  onSave: (p: PartyInput & { id?: number }) => void
}) {
  const [form, setForm] = useState<PartyInput>(EMPTY)
  useEffect(() => { if (open) setForm(party ?? EMPTY) }, [open, party])
  const set = (k: keyof PartyInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <Modal title={title} open={open} onClose={onClose}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, id: party?.id }) }}>
        <Field label="الاسم" className="col-span-2"><Input autoFocus required value={form.name} onChange={set('name')} /></Field>
        <Field label="الهاتف"><Input className="num text-right" value={form.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="العنوان"><Input value={form.address ?? ''} onChange={set('address')} /></Field>
        <Field label="ملاحظات" className="col-span-2"><Input value={form.notes ?? ''} onChange={set('notes')} /></Field>
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Modal>
  )
}
