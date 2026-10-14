// Receipt and barcode-label HTML. No Electron imports: the desktop app prints it in a hidden
// window (electron/print.ts) and the website sends it to the browser to print.
import { barcodeSvg } from '../shared/barcode'
import type { InvoiceWithItems, PaperSize, Product, Settings } from '../shared/types'

const CHANNELS = { retail: 'مبيعات محل', wholesale: 'جملة', distribution: 'توزيعات' }
const METHODS = { cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل', credit: 'آجل' }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const money = (baisa: number) => (baisa / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export function receiptHtml(inv: InvoiceWithItems, s: Settings, paper: PaperSize) {
  const thermal = paper === '80mm'
  const rows = inv.items.map((i) => `
    <tr><td class="name">${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.total)}</td></tr>`).join('')
  const remaining = inv.total - inv.paid
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { margin: ${thermal ? '0' : '12mm'}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Tahoma, 'Segoe UI', 'Geeza Pro', Arial, sans-serif; color: #000; font-size: ${thermal ? '11px' : '13px'}; }
    .wrap { width: ${thermal ? '72mm' : '100%'}; margin: 0 auto; padding: ${thermal ? '3mm 0' : '0'}; }
    h1 { font-size: ${thermal ? '16px' : '22px'}; margin: 0 0 2px; text-align: center; }
    .center { text-align: center; }
    .muted { color: #333; }
    .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 10px; margin: 8px 0; }
    .title { text-align: center; font-weight: bold; border: 1px solid #000; padding: 3px; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: ${thermal ? '3px 1px' : '6px 4px'}; text-align: center; }
    th { border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    td.name { text-align: right; }
    ${thermal ? '' : 'th, td { border: 1px solid #999; } th { background: #eee; }'}
    .totals { margin-top: 6px; border-top: 1px dashed #000; padding-top: 4px; ${thermal ? '' : 'width: 45%; margin-right: auto;'} }
    .totals div { display: flex; justify-content: space-between; padding: 1px 0; }
    .grand { font-weight: bold; font-size: 1.25em; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px !important; }
    .footer { margin-top: 10px; text-align: center; border-top: 1px dashed #000; padding-top: 6px; }
  </style></head><body><div class="wrap">
    <h1>${esc(s.shop_name)}</h1>
    ${s.shop_address ? `<div class="center muted">${esc(s.shop_address)}</div>` : ''}
    ${s.shop_phone ? `<div class="center muted">هاتف: ${esc(s.shop_phone)}</div>` : ''}
    ${s.vat_number ? `<div class="center muted">الرقم الضريبي: ${esc(s.vat_number)}</div>` : ''}
    <div class="title">${inv.vat > 0 ? 'فاتورة ضريبية' : 'فاتورة مبيعات'}${inv.status === 'cancelled' ? ' (ملغاة)' : ''}</div>
    <div class="meta">
      <span>رقم: <b>${esc(inv.number)}</b></span>
      <span>التاريخ: ${esc(inv.created_at)}</span>
      <span>العميل: ${esc(inv.customer_name)}</span>
      <span>النوع: ${CHANNELS[inv.channel]}</span>
    </div>
    <table>
      <thead><tr><th style="text-align:right">الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>المجموع</span><span>${money(inv.subtotal)}</span></div>
      ${inv.discount ? `<div><span>الخصم</span><span>- ${money(inv.discount)}</span></div>` : ''}
      ${inv.vat ? `<div><span>ضريبة القيمة المضافة ${inv.vat_rate}%</span><span>${money(inv.vat)}</span></div>` : ''}
      <div class="grand"><span>الإجمالي (ر.ع)</span><span>${money(inv.total)}</span></div>
      <div><span>طريقة الدفع</span><span>${METHODS[inv.payment_method]}</span></div>
      <div><span>المدفوع</span><span>${money(inv.paid)}</span></div>
      ${remaining > 0 && inv.status !== 'cancelled' ? `<div><span>المتبقي</span><span>${money(remaining)}</span></div>` : ''}
    </div>
    ${s.receipt_footer ? `<div class="footer">${esc(s.receipt_footer)}</div>` : ''}
  </div></body></html>`
}

// ---- Barcode labels ----

export function labelHtml(p: Product, s: Settings, copies: number) {
  const [w, h] = s.label_size.split('x').map(Number)
  const small = h <= 25
  const label = `<div class="label">
      ${s.label_show_shop ? `<div class="shop">${esc(s.shop_name)}</div>` : ''}
      <div class="name">${esc(p.name)}</div>
      <div class="bars">${barcodeSvg(p.code!)}</div>
      <div class="foot"><span class="code">${esc(p.code)}</span>${s.label_show_price ? `<b>${money(p.price)} ر.ع</b>` : ''}</div>
    </div>`
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; }
    body { font-family: Tahoma, 'Segoe UI', 'Geeza Pro', Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; padding: 1.2mm 2mm; display: flex; flex-direction: column; overflow: hidden; break-after: page; }
    .label:last-child { break-after: auto; }
    .shop { font-size: ${small ? 6 : 7.5}pt; text-align: center; color: #222; white-space: nowrap; overflow: hidden; }
    .name { font-size: ${small ? 7.5 : 9}pt; font-weight: bold; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bars { flex: 1; min-height: 0; margin: 0.6mm 0; }
    .bars svg { width: 100%; height: 100%; display: block; }
    .foot { display: flex; justify-content: space-between; align-items: baseline; font-size: ${small ? 7 : 8.5}pt; }
    .code { direction: ltr; letter-spacing: 0.5px; font-family: Consolas, Menlo, monospace; }
    .foot b { font-size: ${small ? 8 : 10}pt; direction: ltr; }
  </style></head><body>${label.repeat(copies)}</body></html>`
}
