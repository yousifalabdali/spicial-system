// The one door into the data, shared by the desktop app (IPC) and the website (HTTP).
// Every call is checked here: who is logged in, and whether their permissions allow this function.
// No Electron imports, so the web server can use this file as-is.
import { getSettings, resetData, saveSettings } from './db'
import * as catalog from './db/catalog'
import * as sales from './db/sales'
import * as purchases from './db/purchases'
import * as treasury from './db/treasury'
import * as reports from './db/reports'
import * as users from './db/users'
import { backupStatus, runBackup, saveBackupConfig } from './backup'
import { labelHtml, receiptHtml } from './printHtml'
import { isEncodable } from '../shared/barcode'
import { can, canManageUsers, type Permission, type User, type UserInput } from '../shared/auth'
import type { PaperSize } from '../shared/types'

/** How the caller is connected: who is logged in, and how to start/end their login on this platform. */
export interface Ctx {
  user: User | null
  login: (user: User) => void
  logout: () => void
  clientKey: string // for rate-limiting logins (IP on the web)
  setupCode: string | null // website only: the one-time code printed in the server log for creating the first account
}

const dataHandlers = {
  ...catalog,
  ...sales,
  ...purchases,
  ...treasury,
  ...reports,
  getSettings,
  saveSettings,
  resetData,
  backupStatus,
  saveBackupConfig,
  runBackup,

  /** Website printing: the browser prints this HTML itself. */
  invoiceHtml(id: number, paper?: PaperSize) {
    const s = getSettings()
    const p = paper ?? s.paper
    const inv = sales.getInvoice(id)
    const images = s.receipt_show_images ? catalog.productImages(inv.items.map((i) => i.product_id)) : {}
    return { html: receiptHtml(inv, s, p, images), paper: p }
  },
  labelHtml(productId: number, copies = 1) {
    const s = getSettings()
    const product = catalog.getProduct(productId)
    if (!product.code) throw new Error('هذا الصنف ليس له باركود. أضف الكود من شاشة المخزون أولاً')
    if (!isEncodable(product.code)) throw new Error('الباركود يقبل الأرقام والحروف الإنجليزية فقط')
    return { html: labelHtml(product, s, Math.min(Math.max(Math.round(copies), 1), 500)) }
  },
}

// ---- Login attempts: 8 wrong passwords lock that user+client for 15 minutes ----
const attempts = new Map<string, { fails: number; until: number }>()
const LOCK_MS = 15 * 60 * 1000

function guardLogin(key: string) {
  const a = attempts.get(key)
  if (a && a.until > Date.now()) throw new Error('محاولات كثيرة خاطئة. حاول بعد 15 دقيقة')
}
function noteFail(key: string) {
  const a = attempts.get(key) ?? { fails: 0, until: 0 }
  a.fails++
  if (a.fails >= 8) { a.until = Date.now() + LOCK_MS; a.fails = 0 }
  attempts.set(key, a)
}

const me = (ctx: Ctx) => ctx.user!

const authHandlers = {
  authStatus: (ctx: Ctx) => ({ user: ctx.user, needsSetup: !users.hasUsers(), setupCodeRequired: ctx.setupCode !== null }),

  login(ctx: Ctx, username: string, password: string) {
    const key = `${ctx.clientKey}|${String(username).toLowerCase()}`
    guardLogin(key)
    try {
      const u = users.verifyLogin(username, password)
      attempts.delete(key)
      ctx.login(u)
      return u
    } catch (e) {
      noteFail(key)
      throw e
    }
  },

  logout(ctx: Ctx) { ctx.logout() },

  setupFirstAdmin(ctx: Ctx, input: { username: string; name: string; password: string; code?: string }) {
    if (ctx.setupCode !== null && String(input.code ?? '').trim().toUpperCase() !== ctx.setupCode) throw new Error('رمز الإعداد غير صحيح. تجده في سجل تشغيل الخادم')
    const u = users.createFirstSuperAdmin(input)
    ctx.login(u)
    return u
  },

  changePassword: (ctx: Ctx, current: string, next: string) => users.changeOwnPassword(me(ctx), current, next),
  listUsers: (ctx: Ctx) => users.listUsers(me(ctx)),
  saveUser: (ctx: Ctx, input: UserInput & { id?: number }) => users.saveUser(me(ctx), input),
  setUserActive: (ctx: Ctx, id: number, active: boolean) => users.setUserActive(me(ctx), id, active),
  deleteUser: (ctx: Ctx, id: number) => users.deleteUser(me(ctx), id),
}

// ---- Who may call what ----
// 'public': no login.  'user': any logged-in account.  'super': super admin only.  'managers': admins and super admins.
// A list of permissions means "any one of these". Functions missing from this table cannot be called at all.
type Rule = 'public' | 'user' | 'super' | 'managers' | Permission[]

const RULES: Record<string, Rule> = {
  authStatus: 'public', login: 'public', logout: 'public', setupFirstAdmin: 'public',
  changePassword: 'user', getSettings: 'user',
  listUsers: 'managers', saveUser: 'managers', setUserActive: 'managers', deleteUser: 'super',
  resetData: 'super',
  backupStatus: 'super', saveBackupConfig: 'super', runBackup: 'super', chooseBackupDir: 'super', openBackupDir: 'super',
  lowStockItems: ['inventory', 'dashboard', 'sales', 'suppliers'],

  dashboard: ['dashboard'],
  salesReport: ['reports'], saveCsv: ['reports'],

  listProducts: ['sales', 'inventory', 'suppliers', 'reports'],
  getProduct: ['sales', 'inventory'], getProductByCode: ['sales', 'inventory'],
  getProductImage: ['sales', 'inventory', 'suppliers', 'reports'],
  saveProduct: ['inventory'], deleteProduct: ['inventory'],
  printLabel: ['inventory', 'sales'], labelHtml: ['inventory', 'sales'],

  listCustomers: ['sales'], saveCustomer: ['sales'], deleteCustomer: ['sales'],
  createInvoice: ['sales'], getInvoice: ['sales'], listInvoices: ['sales'], payInvoice: ['sales'],
  printInvoice: ['sales'], invoiceHtml: ['sales'],
  cancelInvoice: ['invoices_cancel'],

  listSuppliers: ['suppliers'], saveSupplier: ['suppliers'], deleteSupplier: ['suppliers'],
  listPurchases: ['suppliers'], getPurchase: ['suppliers'], createPurchase: ['suppliers'],
  receivePurchase: ['suppliers'], payPurchase: ['suppliers'], cancelPurchase: ['suppliers'],

  treasuryBalance: ['treasury'], listTreasury: ['treasury'], addTreasury: ['treasury'], deleteTreasury: ['treasury'],
  listCheques: ['treasury'], addCheque: ['treasury'], setChequeStatus: ['treasury'], deleteCheque: ['treasury'],

  saveSettings: ['settings'], listPrinters: ['settings'],
}

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403) { super(message) }
}

function authorize(name: string, user: User | null) {
  const rule = Object.hasOwn(RULES, name) ? RULES[name] : undefined // not inherited keys like "constructor"
  if (!rule) throw new AuthError('عملية غير معروفة', 403)
  if (rule === 'public') return
  if (!user) throw new AuthError('انتهت الجلسة. سجّل الدخول من جديد', 401)
  if (rule === 'user') return
  if (rule === 'super' ? user.role === 'super_admin' : rule === 'managers' ? canManageUsers(user) : rule.some((p) => can(user, p))) return
  throw new AuthError('لا تملك صلاحية لهذه العملية', 403)
}

type AnyFn = (...args: never[]) => unknown

/** Run a named function for this caller. `platform` adds functions only one side has (Electron printing, etc.). */
export async function dispatch(name: string, args: unknown[], ctx: Ctx, platform: Record<string, AnyFn> = {}) {
  authorize(name, ctx.user)
  if (Object.hasOwn(authHandlers, name)) return (authHandlers[name as keyof typeof authHandlers] as (ctx: Ctx, ...a: unknown[]) => unknown)(ctx, ...args)
  const fn = (Object.hasOwn(platform, name) ? platform[name] : Object.hasOwn(dataHandlers, name) ? dataHandlers[name as keyof typeof dataHandlers] : undefined) as ((...a: unknown[]) => unknown) | undefined
  if (!fn) throw new AuthError('عملية غير معروفة', 403)
  return fn(...args)
}

export const handlerNames = (platform: Record<string, unknown> = {}) => [...Object.keys(authHandlers), ...Object.keys(dataHandlers), ...Object.keys(platform)]

type DropCtx<T> = { [K in keyof T]: T[K] extends (ctx: Ctx, ...a: infer A) => infer R ? (...a: A) => R : never }
/** What the UI can call (before platform-specific additions). */
export type CoreHandlers = typeof dataHandlers & DropCtx<typeof authHandlers>
