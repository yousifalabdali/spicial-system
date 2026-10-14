// Invoice printing: render receipt HTML in a hidden window, then print or save as PDF.
import { BrowserWindow, app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getSettings } from './db'
import { getInvoice } from './db/sales'
import { getProduct, productImages } from './db/catalog'
import { isEncodable } from '../shared/barcode'
import { labelHtml, receiptHtml } from './printHtml'
import type { PaperSize } from '../shared/types'

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
  const images = settings.receipt_show_images ? productImages(inv.items.map((i) => i.product_id)) : {}
  const win = await renderWindow(receiptHtml(inv, settings, paper, images))
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

export async function printLabel(productId: number, opts: { copies?: number; pdf?: boolean } = {}) {
  const settings = getSettings()
  const product = getProduct(productId)
  if (!product.code) throw new Error('هذا الصنف ليس له باركود. أضف الكود من شاشة المخزون أولاً')
  if (!isEncodable(product.code)) throw new Error('الباركود يقبل الأرقام والحروف الإنجليزية فقط')
  const copies = Math.min(Math.max(Math.round(opts.copies ?? 1), 1), 500)
  const [w, h] = settings.label_size.split('x').map(Number)
  const win = await renderWindow(labelHtml(product, settings, copies))
  try {
    if (opts.pdf) {
      const data = await win.webContents.printToPDF({ pageSize: { width: w / 25.4, height: h / 25.4 }, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
      const file = path.join(app.getPath('temp'), `label-${product.code}.pdf`)
      fs.writeFileSync(file, data)
      await shell.openPath(file)
      return { ok: true, file }
    }
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: settings.silent_print, printBackground: true, deviceName: settings.label_printer || undefined, pageSize: { width: w * 1000, height: h * 1000 }, margins: { marginType: 'none' } },
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
