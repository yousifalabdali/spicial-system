// Emails the shop when a product runs low (Settings -> email alerts). Runs after any change to the data.
import { getSettings } from './db'
import { claimNewLowStock, releaseLowStock, type LowItem } from './db/alerts'
import { mailConfigured, parseRecipients, sendMail } from './mail'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function render(items: LowItem[], shop: string) {
  const rows = items.map((i) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(i.name)}${i.code ? ` <span style="color:#888">(${esc(i.code)})</span>` : ''}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;color:${i.qty <= 0 ? '#e11d48' : '#d97706'};font-weight:bold">${i.qty} ${esc(i.unit)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee">${i.min_qty}</td></tr>`).join('')
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px">
    <h2 style="color:#4f46e5;margin:0 0 8px">تنبيه نقص المخزون</h2>
    <p>${items.length === 1 ? 'وصل هذا الصنف' : 'وصلت هذه الأصناف'} إلى الحد الأدنى في ${esc(shop)}:</p>
    <table style="border-collapse:collapse;min-width:360px"><thead><tr style="background:#eef2ff">
    <th style="padding:6px 10px;text-align:right">الصنف</th><th style="padding:6px 10px;text-align:right">المتوفر</th><th style="padding:6px 10px;text-align:right">الحد الأدنى</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <p style="color:#888;font-size:12px">رسالة تلقائية من Sales Inventory Pro</p></div>`
  const text = `تنبيه نقص المخزون - ${shop}\n` + items.map((i) => `- ${i.name}: ${i.qty} ${i.unit} (الحد الأدنى ${i.min_qty})`).join('\n')
  const subject = items.length === 1 ? `نقص مخزون: ${items[0].name}` : `نقص مخزون: ${items.length} أصناف`
  return { subject, html, text }
}

export async function notifyLowStock() {
  if (!mailConfigured()) return
  const s = await getSettings()
  const to = parseRecipients(s.low_stock_email)
  if (!s.low_stock_email_enabled || !to.length) return
  const items = await claimNewLowStock()
  if (!items.length) return
  const m = render(items, s.shop_name)
  try {
    await sendMail(to, m.subject, m.html, m.text)
  } catch (e) {
    await releaseLowStock(items.map((i) => i.id))
    throw e
  }
}

export async function sendTestEmail(to: string) {
  const list = parseRecipients(to)
  const s = await getSettings()
  await sendMail(list, 'تجربة تنبيهات المخزون', `<div dir="rtl" style="font-family:Tahoma,Arial">وصلتك هذه الرسالة، يعني تنبيهات نقص المخزون من ${esc(s.shop_name)} تعمل ✅</div>`, 'تنبيهات نقص المخزون تعمل')
  return list
}
