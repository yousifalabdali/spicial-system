// Roles and permissions, shared by the server (which enforces them) and the UI (which hides what you can't use).
//   super_admin: everything, and the only role that can grant or withdraw permissions.
//   admin:       the permissions a super admin gave them, plus managing employee accounts.
//   employee:    only the permissions they were given.

export type Role = 'super_admin' | 'admin' | 'employee'

export const ROLE_LABEL: Record<Role, string> = { super_admin: 'سوبر أدمن', admin: 'أدمن', employee: 'موظف' }

export const PERMISSIONS = [
  { id: 'dashboard', label: 'الرئيسية', hint: 'ملخص المبيعات والتنبيهات' },
  { id: 'sales', label: 'المبيعات', hint: 'نقطة البيع والفواتير والعملاء' },
  { id: 'invoices_cancel', label: 'إلغاء الفواتير', hint: 'إلغاء فاتورة وإرجاع كمياتها ومبلغها' },
  { id: 'inventory', label: 'المخزون', hint: 'الأصناف والأسعار وملصقات الباركود' },
  { id: 'treasury', label: 'الخزينة', hint: 'المقبوضات والمدفوعات والشيكات' },
  { id: 'suppliers', label: 'الموردين', hint: 'الموردين وأوامر الشراء' },
  { id: 'reports', label: 'التقارير', hint: 'تقارير المبيعات والأرباح والتصدير' },
  { id: 'settings', label: 'الإعدادات', hint: 'بيانات المحل والضريبة والطباعة' },
] as const

export type Permission = (typeof PERMISSIONS)[number]['id']

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id) as Permission[]

/** What a new employee can do until a super admin changes it. */
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = ['dashboard', 'sales']

export interface User {
  id: number
  username: string
  name: string
  role: Role
  permissions: Permission[] // ignored for super_admin, who has them all
  active: boolean
  created_at: string
  last_login: string | null
}

export interface UserInput {
  username: string
  name: string
  password?: string // required when creating; optional when editing (blank = keep)
  role: Role
  permissions: Permission[]
}

export function can(user: Pick<User, 'role' | 'permissions'> | null | undefined, perm: Permission) {
  if (!user) return false
  return user.role === 'super_admin' || user.permissions.includes(perm)
}

export const canManageUsers = (user: Pick<User, 'role'> | null | undefined) => user?.role === 'super_admin' || user?.role === 'admin'
