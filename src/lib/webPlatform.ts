// Printing and file saving, done on this side of the API. In the desktop app, receipts and labels go
// straight to the configured printer; in a browser, the browser's print dialog opens.
import { api } from './api'
import { toCsv } from '../../shared/csv'
import type { PaperSize } from '../../shared/types'
import type { PrintPage } from '../../shared/desktop'

/** Print an HTML document through a hidden iframe (the browser's print dialog also offers "Save as PDF"). */
function browserPrint(html: string) {
  return new Promise<{ ok: true }>((resolve) => {
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    frame.srcdoc = html
    frame.onload = () => {
      const w = frame.contentWindow!
      const done = () => { frame.remove(); resolve({ ok: true }) }
      w.addEventListener('afterprint', () => setTimeout(done, 100), { once: true })
      setTimeout(() => w.print(), 50) // let fonts and the barcode SVG lay out first
      setTimeout(done, 60_000) // safety net if afterprint never fires
    }
    document.body.appendChild(frame)
  })
}

async function print(html: string, page: PrintPage, printer: 'receipt' | 'label', opts: { pdf?: boolean; pdfName?: string }) {
  if (!window.desktop) return browserPrint(html)
  const s = await api.getSettings()
  await window.desktop.print({
    html, page, pdf: opts.pdf, pdfName: opts.pdfName,
    silent: s.silent_print,
    deviceName: printer === 'label' ? s.label_printer : s.printer_name,
  })
  return { ok: true as const }
}

/** Download a file in the browser (also works inside the desktop app). */
export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const webPlatform = {
  async printInvoice(id: number, opts: { paper?: PaperSize; pdf?: boolean } = {}) {
    const { html, paper } = await api.invoiceHtml(id, opts.paper)
    return print(html, paper === 'A4' ? { kind: 'A4' } : { kind: 'roll80' }, 'receipt', { pdf: opts.pdf, pdfName: `invoice-${id}-${paper}` })
  },

  async printLabel(productId: number, opts: { copies?: number; pdf?: boolean } = {}) {
    const { html, size } = await api.labelHtml(productId, opts.copies ?? 1)
    const [widthMm, heightMm] = size.split('x').map(Number)
    return print(html, { kind: 'label', widthMm, heightMm }, 'label', { pdf: opts.pdf, pdfName: `label-${productId}` })
  },

  async saveCsv(defaultName: string, rows: (string | number)[][]) {
    download(defaultName, toCsv(rows), 'text/csv;charset=utf-8')
    return true
  },

  async listPrinters() {
    return window.desktop ? window.desktop.listPrinters() : [] // in a browser, the print dialog picks the printer
  },
}
