// Desktop printing: the website hands over receipt/label HTML; we render it in a hidden window and
// print straight to the chosen printer (or open it as a PDF).
import { BrowserWindow, app, session, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { PrintJob } from '../shared/desktop'

const MAX_HTML = 5_000_000
const PRINT_PARTITION = 'print' // its own session, so blocking network here never touches the main window

let blocked = false
function printSession() {
  const s = session.fromPartition(PRINT_PARTITION)
  if (!blocked) {
    // The receipt HTML is self-contained (photos are data: URLs): it never needs the network.
    s.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }))
    blocked = true
  }
  return s
}

async function renderWindow(html: string) {
  const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { sandbox: true, session: printSession() } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  return win
}

/** Page size in microns for print(); thermal rolls are as tall as the content. */
async function pageSize(win: BrowserWindow, job: PrintJob) {
  if (job.page.kind === 'A4') return 'A4' as const
  if (job.page.kind === 'label') return { width: job.page.widthMm * 1000, height: job.page.heightMm * 1000 }
  const heightPx: number = await win.webContents.executeJavaScript('(document.querySelector(".wrap") || document.body).scrollHeight')
  const MICRONS_PER_PX = 25400 / 96
  return { width: 80000, height: Math.max(100000, Math.ceil(heightPx * MICRONS_PER_PX) + 10000) }
}

export async function printJob(job: PrintJob) {
  if (typeof job?.html !== 'string' || job.html.length > MAX_HTML) throw new Error('محتوى الطباعة غير صالح')
  const win = await renderWindow(job.html)
  try {
    const size = await pageSize(win, job)
    if (job.pdf) {
      // printToPDF takes custom sizes in inches; print() takes microns.
      const pdfSize = typeof size === 'string' ? size : { width: size.width / 25400, height: size.height / 25400 }
      const a4 = job.page.kind === 'A4'
      const data = await win.webContents.printToPDF({ pageSize: pdfSize, printBackground: true, margins: a4 ? { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } : { top: 0, bottom: 0, left: 0, right: 0 } })
      const name = String(job.pdfName || 'print').replace(/[^\w.-]+/g, '_').slice(0, 60)
      const file = path.join(app.getPath('temp'), `${name}.pdf`)
      fs.writeFileSync(file, data)
      await shell.openPath(file)
      return
    }
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: !!job.silent, printBackground: true, deviceName: job.deviceName || undefined, pageSize: size, margins: { marginType: 'none' } },
        (success, reason) => (success || reason === 'Print job canceled' || reason === 'cancelled' ? resolve() : reject(new Error(`فشلت الطباعة: ${reason}`))),
      )
    })
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
