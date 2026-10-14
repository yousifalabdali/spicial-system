// Website versions of the desktop-only functions: the browser prints and saves files itself.
// src/lib/api.ts routes these names here when the app runs in a browser.
import { api } from './api'
import { toCsv } from '../../shared/csv'
import type { PaperSize } from '../../shared/types'

/** Print an HTML document through a hidden iframe (the browser's print dialog also offers "Save as PDF"). */
function printHtml(html: string) {
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

export const webPlatform = {
  async printInvoice(id: number, opts: { paper?: PaperSize; pdf?: boolean } = {}) {
    const { html } = await api.invoiceHtml(id, opts.paper)
    return printHtml(html)
  },

  async printLabel(productId: number, opts: { copies?: number; pdf?: boolean } = {}) {
    const { html } = await api.labelHtml(productId, opts.copies ?? 1)
    return printHtml(html)
  },

  async saveCsv(defaultName: string, rows: (string | number)[][]) {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: defaultName })
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  },

  async listPrinters() {
    return [] as { name: string; displayName: string }[] // the browser's print dialog picks the printer
  },
}
