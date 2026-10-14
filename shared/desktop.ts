// What the desktop app adds to the website it opens (window.desktop). On a normal browser this is absent.
// The page asks; the desktop app's main process does the printing and file writing and checks the caller.

export type PrintPage = { kind: 'A4' } | { kind: 'roll80' } | { kind: 'label'; widthMm: number; heightMm: number }

export interface PrintJob {
  html: string
  page: PrintPage
  silent: boolean // print straight to the printer, no dialog
  deviceName: string // '' = system default printer
  pdf?: boolean // open as a PDF instead of printing
  pdfName?: string
}

export interface DeviceBackupConfig {
  enabled: boolean
  intervalHours: number
  keep: number // newest N files kept in the folder
  dir: string
}

export interface DeviceBackupState {
  config: DeviceBackupConfig
  last: { at: string; ok: boolean; error?: string; file?: string } | null
  due: boolean
  nextAt: string | null
  files: { name: string; size: number; created: string }[]
}

export interface DesktopBridge {
  print(job: PrintJob): Promise<void>
  listPrinters(): Promise<{ name: string; displayName: string }[]>
  backup: {
    state(): Promise<DeviceBackupState>
    saveConfig(patch: Partial<Omit<DeviceBackupConfig, 'dir'>>): Promise<DeviceBackupState>
    chooseDir(): Promise<DeviceBackupState | null>
    openDir(): Promise<void>
    /** Write one backup file (JSON text from api.exportBackup) and drop old ones. */
    save(json: string): Promise<DeviceBackupState>
    fail(message: string): Promise<void>
  }
  site: {
    current(): Promise<string | null>
    /** Forget the website address and show the connect screen again. */
    change(): Promise<void>
  }
}
