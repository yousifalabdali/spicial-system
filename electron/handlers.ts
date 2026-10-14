// Functions only the desktop app has (they need Electron). Everything else lives in electron/api.ts,
// which also decides who may call these. The renderer gets a typed proxy of all of them (src/lib/api.ts).
import { dialog, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import { listPrinters, printInvoice, printLabel } from './print'
import { toCsv } from '../shared/csv'
import { getBackupConfig, saveBackupConfig } from './backup'
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

  /** Pick the backup folder with the system dialog (the page never types a path). */
  async chooseBackupDir() {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: getBackupConfig().dir })
    if (canceled || !filePaths[0]) return null
    return saveBackupConfig({ dir: filePaths[0] })
  },

  async openBackupDir() {
    const dir = getBackupConfig().dir
    fs.mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  },
}

export type Handlers = CoreHandlers & typeof electronHandlers

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }
