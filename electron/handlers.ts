// Every function the renderer can call. The renderer gets a typed proxy of this object
// (see electron/preload.ts and src/lib/api.ts), so adding a handler here is all that's needed.
import { dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import { getSettings, resetData, saveSettings } from './db'
import * as catalog from './db/catalog'
import * as sales from './db/sales'
import * as purchases from './db/purchases'
import * as treasury from './db/treasury'
import * as reports from './db/reports'
import { listPrinters, printInvoice } from './print'

export const handlers = {
  ...catalog,
  ...sales,
  ...purchases,
  ...treasury,
  ...reports,
  getSettings,
  saveSettings,
  resetData,
  printInvoice,
  listPrinters,

  async saveCsv(defaultName: string, rows: (string | number)[][]) {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return false
    const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
    // BOM so Excel opens Arabic text correctly.
    fs.writeFileSync(filePath, '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'utf8')
    return true
  },
}

export type Handlers = typeof handlers

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }
