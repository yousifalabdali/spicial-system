// The one door into the data for the website (and the desktop app, which opens the website).
// Every call is checked here: who is logged in, and whether their permissions allow this function.
import { getSettings, resetData, saveSettings } from './db'
import * as catalog from './db/catalog'
import * as sales from './db/sales'
import * as purchases from './db/purchases'
import * as treasury from './db/treasury'
import * as reports from './db/reports'
import * as users from './db/users'
import { exportBackup, restoreBackup } from './backup'
import { labelHtml, receiptHtml } from './printHtml'
import { isEncodable } from '../shared/barcode'
import { can, canManageUsers, type Permission, type User, type UserInput } from '../shared/auth'
import type { PaperSize } from '../shared/types'

/** How the caller is connected: who is logged in, and how to start/end their login. */
export interface Ctx {
  user: User | null
  login: (user: User) => Promise<void>
  logout: () => Promise<void>
  clientKey: string // for rate-limiting logins (the visitor's IP)
  setupCode: string | null // the code needed to create the first account (null once accounts exist)
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
  exportBackup,
  restoreBackup,

  /** Printing: the browser (or the desktop app) prints this HTML. */
  async invoiceHtml(id: number, paper?: PaperSize) {
    const s = await getSettings()
    const p = paper ?? s.paper
    const inv = await sales.getInvoice(id)
    const images = s.receipt_show_images ? await catalog.productImages(inv.items.map((i) => i.product_id)) : {}
    return { html: receiptHtml(inv, s, p, images), paper: p }
  },
  async labelHtml(productId: number, copies = 1) {
    const s = await getSettings()
    const product = await catalog.getProduct(productId)
    if (!product.code) throw new Error('هذا الصنف ليس له باركود. أضف الكود من شاشة المخزون أولاً')
    if (!isEncodable(product.code)) throw new Error('الباركود يقبل الأرقام والحروف الإنجليزية فقط')
    return { html: labelHtml(product, s, Math.min(Math.max(Math.round(copies), 1), 500)), size: s.label_size }
  },
}

const me = (ctx: Ctx) => ctx.user!

const authHandlers = {
  authStatus: async (ctx: Ctx) => {
    const needsSetup = !(await users.hasUsers())
    return { user: ctx.user, needsSetup, setupCodeRequired: needsSetup && ctx.setupCode !== null }
  },

  async login(ctx: Ctx, username: string, password: string) {
    const key = `${ctx.clientKey}|${String(username).toLowerCase()}`.slice(0, 200)
    await users.assertNotLocked(key)
    let u: User
    try {
      u = await users.verifyLogin(username, password)
    } catch (e) {
      await users.noteLoginFail(key)
      throw e
    }
    await users.clearLoginFails(key)
    await ctx.login(u)
    return u
  },

  async logout(ctx: Ctx) { await ctx.logout() },

  async setupFirstAdmin(ctx: Ctx, input: { username: string; name: string; password: string; code?: string }) {
    if (ctx.setupCode === null) throw new Error('إنشاء أول حساب غير مفعّل على هذا الخادم: اضبط متغيّر SETUP_CODE')
    if (String(input.code ?? '').trim().toUpperCase() !== ctx.setupCode.toUpperCase()) throw new Error('رمز الإعداد غير صحيح')
    const u = await users.createFirstSuperAdmin(input)
    await ctx.login(u)
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
  resetData: 'super', exportBackup: 'super', restoreBackup: 'super',
  lowStockItems: ['inventory', 'dashboard', 'sales', 'suppliers'],

  dashboard: ['dashboard'],
  salesReport: ['reports'],

  listProducts: ['sales', 'inventory', 'suppliers', 'reports'],
  getProduct: ['sales', 'inventory'], getProductByCode: ['sales', 'inventory'],
  getProductImage: ['sales', 'inventory', 'suppliers', 'reports'],
  saveProduct: ['inventory'], deleteProduct: ['inventory'],
  labelHtml: ['inventory', 'sales'],

  listCustomers: ['sales'], saveCustomer: ['sales'], deleteCustomer: ['sales'],
  createInvoice: ['sales'], getInvoice: ['sales'], listInvoices: ['sales'], payInvoice: ['sales'],
  invoiceHtml: ['sales'],
  cancelInvoice: ['invoices_cancel'],

  listSuppliers: ['suppliers'], saveSupplier: ['suppliers'], deleteSupplier: ['suppliers'],
  listPurchases: ['suppliers'], getPurchase: ['suppliers'], createPurchase: ['suppliers'],
  receivePurchase: ['suppliers'], payPurchase: ['suppliers'], cancelPurchase: ['suppliers'],

  treasuryBalance: ['treasury'], listTreasury: ['treasury'], addTreasury: ['treasury'], deleteTreasury: ['treasury'],
  listCheques: ['treasury'], addCheque: ['treasury'], setChequeStatus: ['treasury'], deleteCheque: ['treasury'],

  saveSettings: ['settings'],
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

/** Run a named function for this caller. */
export async function dispatch(name: string, args: unknown[], ctx: Ctx) {
  authorize(name, ctx.user)
  if (Object.hasOwn(authHandlers, name)) return (authHandlers[name as keyof typeof authHandlers] as (ctx: Ctx, ...a: unknown[]) => unknown)(ctx, ...args)
  if (Object.hasOwn(dataHandlers, name)) return (dataHandlers[name as keyof typeof dataHandlers] as (...a: unknown[]) => unknown)(...args)
  throw new AuthError('عملية غير معروفة', 403)
}

type DropCtx<T> = { [K in keyof T]: T[K] extends (ctx: Ctx, ...a: infer A) => infer R ? (...a: A) => R : never }
/** What the UI can call. */
export type Handlers = typeof dataHandlers & DropCtx<typeof authHandlers>
