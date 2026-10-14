// Desktop app: a window onto the shop's website (data lives in Supabase), plus what a browser can't do:
// silent printing to a chosen printer and automatic backups into a folder on this computer.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { listPrinters, printJob } from './print'
import { backupDir, backupState, getSiteUrl, noteBackupFailure, saveBackupConfig, setSiteUrl, writeBackup } from './device'
import type { PrintJob } from '../shared/desktop'

process.env.APP_ROOT = path.join(__dirname, '..')

let win: BrowserWindow | null = null

// The connect screen: shown until a website address is saved.
const CONNECT_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#e0e7ff,#f3f5fa 55%);font-family:Tahoma,'Segoe UI',sans-serif;color:#0f172a}
  .card{width:420px;background:#fff;border:1px solid #e4e8f1;border-radius:16px;padding:28px;box-shadow:0 20px 40px rgba(15,23,42,.06)}
  h1{font-size:18px;margin:0 0 6px} p{font-size:13px;color:#64748b;margin:0 0 18px;line-height:1.7}
  input{width:100%;box-sizing:border-box;border:1px solid #e4e8f1;border-radius:12px;padding:10px 12px;font-size:14px;direction:ltr;outline:none}
  input:focus{border-color:#4f46e5;box-shadow:0 0 0 4px rgba(79,70,229,.1)}
  button{margin-top:14px;width:100%;border:0;border-radius:12px;padding:11px;background:#4f46e5;color:#fff;font-size:14px;font-weight:bold;cursor:pointer}
  .err{color:#e11d48;font-size:13px;margin-top:10px;min-height:18px}
</style></head><body><form class="card" id="f">
  <h1>Sales Inventory Pro</h1>
  <p>اكتب عنوان موقع المحل (مثل https://my-shop.vercel.app). سيفتح البرنامج الموقع ويضيف الطباعة المباشرة والنسخ الاحتياطي على هذا الجهاز.</p>
  <input id="u" placeholder="https://" autofocus required>
  <button>اتصال</button><div class="err" id="e"></div>
</form><script>
  document.getElementById('f').onsubmit = async (ev) => {
    ev.preventDefault()
    try { await window.connect.set(document.getElementById('u').value) }
    catch (err) { document.getElementById('e').textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }
  }
</script></body></html>`

const CONNECT_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(CONNECT_HTML)

function open() {
  const site = getSiteUrl()
  if (!win) return
  if (site) win.loadURL(site)
  else win.loadURL(CONNECT_URL)
}

const originOf = (url: string) => URL.parse(url)?.origin ?? ''

/** Bridge calls are honoured only from the configured website's own pages. */
function fromSite(e: IpcMainInvokeEvent) {
  const site = getSiteUrl()
  if (!site || originOf(e.senderFrame?.url ?? '') !== site) throw new Error('غير مسموح')
}

function registerIpc() {
  const handle = (channel: string, fn: (...args: never[]) => unknown) =>
    ipcMain.handle(channel, (e, ...args) => { fromSite(e); return (fn as (...a: unknown[]) => unknown)(...args) })

  handle('desktop:print', (job: PrintJob) => printJob(job))
  handle('desktop:printers', () => listPrinters())
  handle('desktop:backup:state', () => backupState())
  handle('desktop:backup:config', (patch: Parameters<typeof saveBackupConfig>[0]) => saveBackupConfig({ ...patch, dir: undefined }))
  handle('desktop:backup:save', (json: string) => writeBackup(json))
  handle('desktop:backup:fail', (msg: string) => noteBackupFailure(msg))
  handle('desktop:backup:open', async () => { await shell.openPath(backupDir()) })
  handle('desktop:backup:choose', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: backupDir() })
    return r.canceled || !r.filePaths[0] ? null : saveBackupConfig({ dir: r.filePaths[0] })
  })
  handle('desktop:site:current', () => getSiteUrl())
  handle('desktop:site:change', () => { setSiteUrl(null); open() })

  // Only the connect screen may set the address.
  ipcMain.handle('connect:set', async (e, url: string) => {
    if (!(e.senderFrame?.url ?? '').startsWith('data:')) throw new Error('غير مسموح')
    const site = setSiteUrl(url)
    open()
    return site
  })
}

function createWindow() {
  win = new BrowserWindow({
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
      sandbox: true,
    },
  })

  // Stay on the shop's website; anything else opens in the normal browser.
  win.webContents.on('will-navigate', (e, url) => {
    const site = getSiteUrl()
    if (url.startsWith('data:') || (site && originOf(url) === site)) return
    e.preventDefault()
    if (/^https?:/.test(url)) shell.openExternal(url)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Website unreachable (offline, wrong address): explain, and offer to change it.
  win.webContents.on('did-fail-load', async (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith('data:')) return // -3 = aborted by a new navigation
    const { response } = await dialog.showMessageBox(win!, {
      type: 'warning', buttons: ['إعادة المحاولة', 'تغيير عنوان الموقع'], defaultId: 0,
      message: 'تعذّر فتح موقع المحل', detail: `${url}\n${desc}\nتحقق من اتصال الإنترنت.`,
    })
    if (response === 1) setSiteUrl(null)
    open()
  })
  open()
}

// One copy of the app at a time: a second launch just focuses the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    app.setAppUserModelId('com.salesinventorypro.app') // needed for Windows notifications
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
