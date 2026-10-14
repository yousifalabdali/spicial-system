// Automatic backups of store.db into a folder, on a schedule set by the super admin (control panel).
// Uses SQLite's online backup, so a copy taken while the shop is selling is still consistent.
// No Electron imports: the desktop app and the web server both run this.
import fs from 'node:fs'
import path from 'node:path'
import { getDb, getMeta, setMeta } from './db'

export interface BackupConfig {
  enabled: boolean
  intervalHours: number // 1, 6, 24, 168...
  keep: number // newest N backups kept, older ones deleted
  dir: string
}
export interface BackupFile { name: string; size: number; created: string }
export interface BackupStatus {
  config: BackupConfig
  last: { at: string; ok: boolean; error?: string; file?: string } | null
  nextAt: string | null
  files: BackupFile[]
  canChooseDir: boolean // desktop only: on a server, the folder is fixed
}

const FILE_RE = /^store-\d{4}-\d{2}-\d{2}_\d{6}\.db$/
let defaultDir = ''
let canChooseDir = false
let running: Promise<unknown> | null = null

export function getBackupConfig(): BackupConfig {
  const stored = JSON.parse(getMeta('backup') ?? '{}') as Partial<BackupConfig>
  return { enabled: true, intervalHours: 24, keep: 14, ...stored, dir: (canChooseDir && stored.dir) || defaultDir }
}

export function saveBackupConfig(patch: Partial<BackupConfig>): BackupStatus {
  const cur = getBackupConfig()
  const next: BackupConfig = {
    enabled: patch.enabled ?? cur.enabled,
    intervalHours: Math.min(Math.max(Math.round(Number(patch.intervalHours ?? cur.intervalHours)) || 24, 1), 24 * 30),
    keep: Math.min(Math.max(Math.round(Number(patch.keep ?? cur.keep)) || 14, 1), 365),
    dir: cur.dir,
  }
  if (canChooseDir && typeof patch.dir === 'string' && patch.dir) {
    if (!path.isAbsolute(patch.dir)) throw new Error('مسار المجلد غير صالح')
    fs.mkdirSync(patch.dir, { recursive: true })
    fs.accessSync(patch.dir, fs.constants.W_OK)
    next.dir = patch.dir
  }
  setMeta('backup', JSON.stringify(next))
  return backupStatus()
}

const pad = (n: number) => String(n).padStart(2, '0')
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
const localTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

export function listBackups(dir = getBackupConfig().dir): BackupFile[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => FILE_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name))
      return { name, size: st.size, created: localTime(st.mtime) }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** Full path of a backup in the current folder, or null for anything that isn't one of our backup files. */
export function backupPath(name: string) {
  if (!FILE_RE.test(name)) return null
  const file = path.join(getBackupConfig().dir, name)
  return fs.existsSync(file) ? file : null
}

function lastRun(): (BackupStatus['last'] & { ts?: number }) | null {
  const raw = getMeta('backup_last')
  return raw ? JSON.parse(raw) : null
}

export async function runBackup() {
  if (running) await running // never two copies at once
  const cfg = getBackupConfig()
  const task = (async () => {
    const file = path.join(cfg.dir, `store-${stamp()}.db`)
    try {
      fs.mkdirSync(cfg.dir, { recursive: true })
      await getDb().backup(file)
      setMeta('backup_last', JSON.stringify({ at: localTime(new Date()), ok: true, file: path.basename(file), ts: Date.now() }))
      for (const old of listBackups(cfg.dir).slice(cfg.keep)) fs.rmSync(path.join(cfg.dir, old.name), { force: true })
      return { ok: true as const, file: path.basename(file) }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      setMeta('backup_last', JSON.stringify({ at: localTime(new Date()), ok: false, error, ts: Date.now() }))
      throw new Error(`فشل النسخ الاحتياطي: ${error}`)
    }
  })()
  running = task
  try { return await task } finally { running = null }
}

export function backupStatus(): BackupStatus {
  const config = getBackupConfig()
  const last = lastRun()
  const nextAt = config.enabled ? localTime(new Date(last?.ts ? last.ts + config.intervalHours * 3_600_000 : Date.now())) : null
  return { config, last, nextAt, files: listBackups(config.dir), canChooseDir }
}

/** Start the schedule. Checks every few minutes whether a backup is due. */
export function initBackups(opts: { defaultDir: string; canChooseDir: boolean }) {
  defaultDir = opts.defaultDir
  canChooseDir = opts.canChooseDir
  const tick = () => {
    const cfg = getBackupConfig()
    if (cfg.enabled && Date.now() - (lastRun()?.ts ?? 0) >= cfg.intervalHours * 3_600_000) {
      runBackup().catch((e) => console.error('[backup]', e))
    }
  }
  setTimeout(tick, 20_000).unref?.() // shortly after start-up, not during it
  setInterval(tick, 5 * 60_000).unref?.()
}
