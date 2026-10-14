// Exposes window.desktop (printing, device backups) to the shop's website, and window.connect to the
// connect screen. The main process re-checks the caller's origin on every call.
import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge, PrintJob } from '../shared/desktop'

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

if (location.protocol === 'data:') {
  contextBridge.exposeInMainWorld('connect', { set: (url: string) => call('connect:set', url) })
} else {
  const desktop: DesktopBridge = {
    print: (job: PrintJob) => call('desktop:print', job),
    listPrinters: () => call('desktop:printers'),
    backup: {
      state: () => call('desktop:backup:state'),
      saveConfig: (patch) => call('desktop:backup:config', patch),
      chooseDir: () => call('desktop:backup:choose'),
      openDir: () => call('desktop:backup:open'),
      save: (json) => call('desktop:backup:save', json),
      fail: (message) => call('desktop:backup:fail', message),
    },
    site: {
      current: () => call('desktop:site:current'),
      change: () => call('desktop:site:change'),
    },
  }
  contextBridge.exposeInMainWorld('desktop', desktop)
}
