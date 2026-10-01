// Cash box movements and cheques.
import { getDb } from './index'
import type { Cheque, ChequeInput, TreasuryEntry, TreasuryInput } from '../../shared/types'

const db = () => getDb()

export function treasuryBalance(): number {
  const r = db().prepare("SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS b FROM treasury").get() as { b: number }
  return r.b
}

export function listTreasury(filter: { from?: string; to?: string } = {}): TreasuryEntry[] {
  const where: string[] = []
  const params: string[] = []
  if (filter.from) { where.push('date(created_at) >= ?'); params.push(filter.from) }
  if (filter.to) { where.push('date(created_at) <= ?'); params.push(filter.to) }
  return db().prepare(`SELECT * FROM treasury ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`).all(...params) as TreasuryEntry[]
}

export function addTreasury(input: TreasuryInput) {
  const amount = Math.round(input.amount)
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح')
  if (!input.category?.trim()) throw new Error('التصنيف مطلوب')
  db().prepare('INSERT INTO treasury (type, category, amount, description) VALUES (?, ?, ?, ?)').run(input.type, input.category.trim(), amount, input.description?.trim() || null)
}

export function deleteTreasury(id: number) {
  const row = db().prepare('SELECT ref FROM treasury WHERE id = ?').get(id) as { ref: string | null } | undefined
  if (row?.ref) throw new Error('هذه الحركة مرتبطة بفاتورة أو أمر شراء ولا يمكن حذفها')
  db().prepare('DELETE FROM treasury WHERE id = ?').run(id)
}

export function listCheques(): Cheque[] {
  return db().prepare("SELECT * FROM cheques ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, due_date").all() as Cheque[]
}

export function addCheque(input: ChequeInput) {
  const amount = Math.round(input.amount)
  if (!(amount > 0)) throw new Error('المبلغ غير صحيح')
  if (!input.number?.trim() || !input.party?.trim() || !input.due_date) throw new Error('رقم الشيك والجهة وتاريخ الاستحقاق مطلوبة')
  db().prepare('INSERT INTO cheques (direction, number, bank, party, amount, due_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    input.direction, input.number.trim(), input.bank?.trim() || null, input.party.trim(), amount, input.due_date, input.notes?.trim() || null,
  )
}

/** Clearing a cheque records the money in the treasury; bouncing just marks it. */
export function setChequeStatus(id: number, status: 'cleared' | 'bounced') {
  const c = db().prepare('SELECT * FROM cheques WHERE id = ?').get(id) as Cheque | undefined
  if (!c) throw new Error('الشيك غير موجود')
  if (c.status !== 'pending') throw new Error('تم تحديث حالة هذا الشيك مسبقاً')
  db().transaction(() => {
    db().prepare('UPDATE cheques SET status = ? WHERE id = ?').run(status, id)
    if (status === 'cleared') {
      db().prepare("INSERT INTO treasury (type, category, amount, description, ref) VALUES (?, 'cheque', ?, ?, ?)").run(
        c.direction, c.amount, `شيك رقم ${c.number} - ${c.party}`, `CHQ-${c.id}`,
      )
    }
  })()
}

export function deleteCheque(id: number) {
  db().prepare("DELETE FROM cheques WHERE id = ? AND status = 'pending'").run(id)
}
