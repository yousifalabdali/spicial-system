import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'node:path'
import { openDb } from './db'
import { seedIfEmpty } from './db/seed'
import { handlers } from './handlers'

process.env.APP_ROOT = path.join(__dirname, '..')
const DEV_URL = process.env.VITE_DEV_SERVER_URL

function registerIpc() {
  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`api:${name}`, async (_e, ...args: unknown[]) => {
      try {
        return { ok: true, data: await (fn as (...a: unknown[]) => unknown)(...args) }
      } catch (err) {
        console.error(`[api:${name}]`, err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a1631',
    title: 'Sales Inventory Pro',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(path.join(process.env.APP_ROOT!, 'dist', 'index.html'))
}

// One copy of the app at a time: a second launch just focuses the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    openDb(path.join(app.getPath('userData'), 'store.db'))
    seedIfEmpty()
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
