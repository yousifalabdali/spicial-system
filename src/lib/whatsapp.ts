// Send an invoice to the customer's WhatsApp: opens WhatsApp (app or web) with the message ready;
// the cashier presses send. No WhatsApp Business account needed.
import { fmt, CURRENCY } from './money'
import { isDesktop } from './api'
import type { InvoiceWithItems, Settings } from '../../shared/types'

/** Country code added to local numbers (Oman). */
const DEFAULT_COUNTRY = '968'

/** "9123 4567", "+968 9123-4567", "00968..." -> "96891234567". Null when it can't be a phone number. */
export function waNumber(phone: string | null | undefined): string | null {
  let d = String(phone ?? '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.length === 8) d = DEFAULT_COUNTRY + d
  return d.length >= 10 && d.length <= 15 ? d : null
}

export function invoiceMessage(inv: InvoiceWithItems, shop: Pick<Settings, 'shop_name' | 'shop_phone'>) {
  const remaining = inv.total - inv.paid
  return [
    `*${shop.shop_name || 'فاتورة'}*`,
    `فاتورة رقم: ${inv.number}`,
    `التاريخ: ${inv.created_at}`,
    `العميل: ${inv.customer_name}`,
    '',
    ...inv.items.map((i) => `• ${i.name} × ${i.qty} = ${fmt(i.total)}`),
    '',
    inv.discount > 0 ? `الخصم: ${fmt(inv.discount)}` : '',
    inv.vat > 0 ? `الضريبة ${inv.vat_rate}%: ${fmt(inv.vat)}` : '',
    `*الإجمالي: ${fmt(inv.total)} ${CURRENCY}*`,
    `المدفوع: ${fmt(inv.paid)}`,
    remaining > 0 && inv.status !== 'cancelled' ? `المتبقي: ${fmt(remaining)}` : '',
    '',
    'شكراً لتعاملكم معنا',
    shop.shop_phone ? `للتواصل: ${shop.shop_phone}` : '',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const waLink = (number: string, text: string) => `https://api.whatsapp.com/send/?phone=${number}&text=${encodeURIComponent(text)}`

/**
 * Browsers block windows opened after an await, so grab one during the click and fill it later.
 * The desktop app sends links to the system browser instead, so there it isn't needed.
 */
export function reserveWindow(): Window | null {
  if (isDesktop) return null
  const w = window.open('about:blank', '_blank')
  if (w) w.opener = null
  return w
}

export function openWhatsApp(url: string, reserved: Window | null) {
  if (reserved && !reserved.closed) reserved.location.href = url
  else window.open(url, '_blank', 'noopener')
}
