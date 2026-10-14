// Functions only the desktop app has (they need Electron). Everything else lives in electron/api.ts,
// which also decides who may call these. The renderer gets a typed proxy of all of them (src/lib/api.ts).
import { dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import { listPrinters, printInvoice, printLabel } from './print'
import { toCsv } from '../shared/csv'
import type { CoreHandlers } from './api'

export const electronHandlers = {
  printInvoice,
  printLabel,
  listPrinters,

  async saveCsv(defaultName: string, rows: (string | number)[][]) {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return false
    fs.writeFileSync(filePath, toCsv(rows), 'utf8')
    return true
  },
}

export type Handlers = CoreHandlers & typeof electronHandlers

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }
