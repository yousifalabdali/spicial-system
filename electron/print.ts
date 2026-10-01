// Invoice printing: render receipt HTML in a hidden window, then print or save as PDF.
import { BrowserWindow, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getSettings } from './db'
import { getInvoice } from './db/sales'
import type { InvoiceWithItems, PaperSize, Settings } from '../shared/types'

const CHANNELS = { retail: 'مبيعات محل', wholesale: 'جملة', distribution: 'توزيعات' }
const METHODS = { cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل', credit: 'آجل' }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const money = (baisa: number) => (baisa / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function receiptHtml(inv: InvoiceWithItems, s: Settings, paper: PaperSize) {
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

async function renderWindow(html: string) {
  const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { sandbox: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  return win
}

/** Thermal rolls have no fixed height: size the page to the rendered content. */
async function pageSizeFor(win: BrowserWindow, paper: PaperSize) {
  if (paper === 'A4') return 'A4' as const
  const heightPx: number = await win.webContents.executeJavaScript('document.querySelector(".wrap").scrollHeight')
  const MICRONS_PER_PX = 25400 / 96
  return { width: 80000, height: Math.max(100000, Math.ceil(heightPx * MICRONS_PER_PX) + 10000) }
}

export async function printInvoice(id: number, opts: { paper?: PaperSize; pdf?: boolean } = {}) {
  const settings = getSettings()
  const paper = opts.paper ?? settings.paper
  const inv = getInvoice(id)
  const win = await renderWindow(receiptHtml(inv, settings, paper))
  try {
    const pageSize = await pageSizeFor(win, paper)
    if (opts.pdf) {
      // printToPDF takes custom sizes in inches; print() takes microns.
      const pdfSize = typeof pageSize === 'string' ? pageSize : { width: pageSize.width / 25400, height: pageSize.height / 25400 }
      const data = await win.webContents.printToPDF({ pageSize: pdfSize, printBackground: true, margins: paper === 'A4' ? { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } : { top: 0, bottom: 0, left: 0, right: 0 } })
      const file = path.join(app.getPath('temp'), `${inv.number}-${paper}.pdf`)
      fs.writeFileSync(file, data)
      await shell.openPath(file)
      return { ok: true, file }
    }
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: settings.silent_print, printBackground: true, deviceName: settings.printer_name || undefined, pageSize, margins: { marginType: 'none' } },
        (success, reason) => (success || reason === 'Print job canceled' || reason === 'cancelled' ? resolve() : reject(new Error(`فشلت الطباعة: ${reason}`))),
      )
    })
    return { ok: true }
  } finally {
    win.destroy()
  }
}

export async function listPrinters() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return []
  const printers = await win.webContents.getPrintersAsync()
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }))
}
