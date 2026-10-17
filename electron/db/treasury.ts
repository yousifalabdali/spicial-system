// Cash box movements and cheques.
import { q, tx } from './sql'
import { C, MAX } from './columns'
import type { Cheque, ChequeInput, TreasuryEntry, TreasuryInput } from '../../shared/types'

export async function treasuryBalance(): Promise<number> {
  const r = await q.one<{ b: number }>("SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS b FROM treasury")
  return r!.b
}

export async function listTreasury(filter: { from?: string; to?: string } = {}): Promise<TreasuryEntry[]> {
  const where: string[] = []
  const params: string[] = []
  if (filter.from) { where.push('substr(created_at, 1, 10) >= ?'); params.push(filter.from) }
  if (filter.to) { where.push('substr(created_at, 1, 10) <= ?'); params.push(filter.to) }
  return q.all<TreasuryEntry>(`SELECT ${C.treasury()} FROM treasury ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`, ...params)
}

export async function addTreasury(input: TreasuryInput) {
  const amount = Math.round(input.amount)
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح')
  if (!input.category?.trim()) throw new Error('التصنيف مطلوب')
  if (input.type !== 'in' && input.type !== 'out') throw new Error('نوع الحركة غير صحيح')
  await q.run('INSERT INTO treasury (type, category, amount, description) VALUES (?, ?, ?, ?)', input.type, input.category.trim(), amount, input.description?.trim() || null)
}

export async function deleteTreasury(id: number) {
  const row = await q.one<{ ref: string | null }>('SELECT ref FROM treasury WHERE id = ?', id)
  if (row?.ref) throw new Error('هذه الحركة مرتبطة بفاتورة أو أمر شراء ولا يمكن حذفها')
  await q.run('DELETE FROM treasury WHERE id = ?', id)
}

export async function listCheques(): Promise<Cheque[]> {
  return q.all<Cheque>(`SELECT ${C.cheque()} FROM cheques ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, due_date LIMIT ${MAX.cheques}`)
}

export async function addCheque(input: ChequeInput) {
  const amount = Math.round(input.amount)
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح')
  if (!input.number?.trim() || !input.party?.trim() || !input.due_date) throw new Error('رقم الشيك والجهة وتاريخ الاستحقاق مطلوبة')
  if (input.direction !== 'in' && input.direction !== 'out') throw new Error('نوع الشيك غير صحيح')
  await q.run('INSERT INTO cheques (direction, number, bank, party, amount, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    input.direction, input.number.trim(), input.bank?.trim() || null, input.party.trim(), amount, input.due_date, input.notes?.trim() || null)
}

/** Clearing a cheque records the money in the treasury; bouncing just marks it. */
export async function setChequeStatus(id: number, status: 'cleared' | 'bounced') {
  if (status !== 'cleared' && status !== 'bounced') throw new Error('حالة غير صحيحة')
  await tx(async () => {
    const c = await q.one<Cheque>(`SELECT ${C.cheque()} FROM cheques WHERE id = ? FOR UPDATE`, id)
    if (!c) throw new Error('الشيك غير موجود')
    if (c.status !== 'pending') throw new Error('تم تحديث حالة هذا الشيك مسبقاً')
    await q.run('UPDATE cheques SET status = ? WHERE id = ?', status, id)
    if (status === 'cleared') {
      await q.run("INSERT INTO treasury (type, category, amount, description, ref) VALUES (?, 'cheque', ?, ?, ?)", c.direction, c.amount, `شيك رقم ${c.number} - ${c.party}`, `CHQ-${c.id}`)
    }
  })
}

export async function deleteCheque(id: number) {
  await q.run("DELETE FROM cheques WHERE id = ? AND status = 'pending'", id)
}
