import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'node:path'
import { openDb } from './db'
import { seedIfEmpty } from './db/seed'
import { electronHandlers } from './handlers'
import { AuthError, dispatch, handlerNames, type Ctx } from './api'
import { activeUser } from './db/users'
import { initBackups } from './backup'

process.env.APP_ROOT = path.join(__dirname, '..')
const DEV_URL = process.env.VITE_DEV_SERVER_URL

// The desktop login lives here in the main process (the page never holds a token).
// It is re-read from the database on every call, so a withdrawn permission or a stopped account applies at once.
let loggedInId: number | null = null

function registerIpc() {
  for (const name of handlerNames(electronHandlers)) {
    ipcMain.handle(`api:${name}`, async (_e, ...args: unknown[]) => {
      const ctx: Ctx = {
        user: activeUser(loggedInId),
        login: (u) => { loggedInId = u.id },
        logout: () => { loggedInId = null },
        clientKey: 'desktop',
        setupCode: null,
      }
      try {
        return { ok: true, data: await dispatch(name, args, ctx, electronHandlers) }
      } catch (err) {
        if (!(err instanceof AuthError)) console.error(`[api:${name}]`, err)
        return { ok: false, error: err instanceof Error ? err.message : String(err), status: err instanceof AuthError ? err.status : undefined }
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
    backgroundColor: '#f3f5fa',
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
    app.setAppUserModelId('com.salesinventorypro.app') // needed for Windows notifications
    openDb(path.join(app.getPath('userData'), 'store.db'))
    initBackups({ defaultDir: path.join(app.getPath('documents'), 'Sales Inventory Pro Backups'), canChooseDir: true })
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
