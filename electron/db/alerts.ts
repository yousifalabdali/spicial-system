// Which products just ran low and still need an email. A product is emailed once when it drops to its
// minimum, and becomes eligible again after it is restocked above it.
import { q, tx } from './sql'

export interface LowItem { id: number; name: string; code: string | null; qty: number; min_qty: number; unit: string }

/** Claim the products that newly ran low. Atomic, so two servers never send the same alert. */
export function claimNewLowStock(): Promise<LowItem[]> {
  return tx(async () => {
    await q.run('UPDATE products SET low_alert_sent = 0 WHERE low_alert_sent = 1 AND (qty > min_qty OR deleted = 1)')
    return q.all<LowItem>(`UPDATE products SET low_alert_sent = 1
      WHERE deleted = 0 AND low_alert_sent = 0 AND qty <= min_qty
      RETURNING id, name, code, qty, min_qty, unit`)
  })
}

/** The email failed: try these again next time. */
export async function releaseLowStock(ids: number[]) {
  if (ids.length) await q.run('UPDATE products SET low_alert_sent = 0 WHERE id = ANY(?::int[])', ids)
}
