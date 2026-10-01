// Money is stored as integer baisa (1 OMR = 1000 baisa) and shown with 3 decimals.

export const CURRENCY = 'ر.ع'

export function fmt(baisa: number) {
  return (baisa / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

/** Compact form for chart axes: 12.5K */
export function fmtShort(baisa: number) {
  const omr = baisa / 1000
  if (Math.abs(omr) >= 1000) return `${+(omr / 1000).toFixed(1)}K`
  return String(+omr.toFixed(1))
}

/** "1.250" (OMR, typed by the user) -> 1250 baisa */
export function toBaisa(omr: string | number) {
  const n = typeof omr === 'number' ? omr : parseFloat(String(omr).replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 1000) : 0
}

/** 1250 baisa -> "1.250" for an input field */
export function toOmrInput(baisa: number) {
  return (baisa / 1000).toFixed(3)
}

export function calcTotals(subtotal: number, discount: number, vatRate: number) {
  const d = Math.min(Math.max(discount, 0), subtotal)
  const vat = Math.round(((subtotal - d) * vatRate) / 100)
  return { discount: d, vat, total: subtotal - d + vat }
}
