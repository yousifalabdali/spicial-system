// Settings that belong to this computer (not the website): which website to open, and automatic
// backups into a folder here. Stored as JSON in the app's user-data folder.
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { DeviceBackupConfig, DeviceBackupState } from '../shared/desktop'

interface DeviceConfig {
  siteUrl: string | null
  backup: DeviceBackupConfig
  lastBackup: { at: string; ok: boolean; error?: string; file?: string; ts: number } | null
}

const FILE_RE = /^sales-backup-\d{4}-\d{2}-\d{2}_\d{6}\.json$/
const file = () => path.join(app.getPath('userData'), 'desktop.json')
const defaultDir = () => path.join(app.getPath('documents'), 'Sales Inventory Pro Backups')

function load(): DeviceConfig {
  let stored: Partial<DeviceConfig> = {}
  try { stored = JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { /* first run */ }
  return {
    siteUrl: stored.siteUrl ?? process.env.SITE_URL ?? null,
    backup: { enabled: true, intervalHours: 24, keep: 30, dir: defaultDir(), ...stored.backup },
    lastBackup: stored.lastBackup ?? null,
  }
}

function save(cfg: DeviceConfig) {
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2))
}

// ---- Website address ----

/** https://… (or http://localhost for testing) only; returns the normalised origin. */
export function normaliseSiteUrl(input: string) {
  const u = URL.parse(String(input ?? '').trim().replace(/\/+$/, ''))
  if (!u || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) {
    throw new Error('اكتب عنوان الموقع كاملاً ويبدأ بـ https://')
  }
  return u.origin
}

export const getSiteUrl = () => load().siteUrl
export function setSiteUrl(url: string | null) {
  const cfg = load()
  cfg.siteUrl = url ? normaliseSiteUrl(url) : null
  save(cfg)
  return cfg.siteUrl
}

// ---- Backups into a folder on this computer ----

const pad = (n: number) => String(n).padStart(2, '0')
const localTime = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

function listFiles(dir: string) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => FILE_RE.test(n)).map((name) => {
    const st = fs.statSync(path.join(dir, name))
    return { name, size: st.size, created: localTime(st.mtime) }
  }).sort((a, b) => b.name.localeCompare(a.name))
}

export function backupState(): DeviceBackupState {
  const { backup, lastBackup } = load()
  const nextTs = lastBackup ? lastBackup.ts + backup.intervalHours * 3_600_000 : Date.now()
  return {
    config: backup,
    last: lastBackup && { at: lastBackup.at, ok: lastBackup.ok, error: lastBackup.error, file: lastBackup.file },
    due: backup.enabled && Date.now() >= nextTs,
    nextAt: backup.enabled ? localTime(new Date(nextTs)) : null,
    files: listFiles(backup.dir),
  }
}

export function saveBackupConfig(patch: Partial<DeviceBackupConfig>) {
  const cfg = load()
  if (typeof patch.enabled === 'boolean') cfg.backup.enabled = patch.enabled
  if (patch.intervalHours !== undefined) cfg.backup.intervalHours = Math.min(Math.max(Math.round(Number(patch.intervalHours)) || 24, 1), 24 * 30)
  if (patch.keep !== undefined) cfg.backup.keep = Math.min(Math.max(Math.round(Number(patch.keep)) || 30, 1), 365)
  if (patch.dir) {
    if (!path.isAbsolute(patch.dir)) throw new Error('مسار المجلد غير صالح')
    fs.mkdirSync(patch.dir, { recursive: true })
    fs.accessSync(patch.dir, fs.constants.W_OK)
    cfg.backup.dir = patch.dir
  }
  save(cfg)
  return backupState()
}

export function writeBackup(json: string) {
  const parsed = JSON.parse(json) as { app?: string }
  if (parsed?.app !== 'sales-inventory-pro') throw new Error('بيانات النسخة غير صالحة')
  const cfg = load()
  const now = new Date()
  const name = `sales-backup-${stamp(now)}.json`
  fs.mkdirSync(cfg.backup.dir, { recursive: true })
  fs.writeFileSync(path.join(cfg.backup.dir, name), json)
  for (const old of listFiles(cfg.backup.dir).slice(cfg.backup.keep)) fs.rmSync(path.join(cfg.backup.dir, old.name), { force: true })
  cfg.lastBackup = { at: localTime(now), ok: true, file: name, ts: now.getTime() }
  save(cfg)
  return backupState()
}

export function noteBackupFailure(message: string) {
  const cfg = load()
  const now = new Date()
  // Try again in an hour rather than on every check.
  cfg.lastBackup = { at: localTime(now), ok: false, error: String(message).slice(0, 300), ts: now.getTime() - Math.max(0, cfg.backup.intervalHours - 1) * 3_600_000 }
  save(cfg)
}

export const backupDir = () => load().backup.dir
