// Accounts, passwords and the rules for who may manage whom.
// Every function that changes accounts takes the acting user and checks the rules itself,
// so they hold no matter which screen (or HTTP request) called them.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { nowLocal } from './index'
import { q, tx, SQL_NOW } from './sql'
import { ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, type Permission, type Role, type User, type UserInput } from '../../shared/auth'

const SESSION_DAYS = 30
const LOCK_AFTER = 8 // wrong passwords in a row
const LOCK_MS = 15 * 60 * 1000
const ROLES: Role[] = ['super_admin', 'admin', 'employee']

type Row = Omit<User, 'permissions' | 'active'> & { permissions: string; active: number; password_hash: string }

/** Known permissions only, in a fixed order (so two lists can be compared). */
function cleanPermissions(perms: unknown): Permission[] {
  return Array.isArray(perms) ? ALL_PERMISSIONS.filter((p) => perms.includes(p)) : []
}

function toUser(r: Row): User {
  return { id: r.id, username: r.username, name: r.name, role: r.role, permissions: cleanPermissions(JSON.parse(r.permissions)), active: !!r.active, created_at: r.created_at, last_login: r.last_login }
}

// ---- Passwords ----

function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`
}

function checkPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split('$')
  if (!salt || !hash) return false
  const want = Buffer.from(hash, 'hex')
  const got = scryptSync(password, Buffer.from(salt, 'hex'), want.length)
  return timingSafeEqual(got, want)
}

function validPassword(password: string | undefined) {
  if (!password || password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
  return password
}

// A real hash to compare against when the username doesn't exist, so timing doesn't reveal which usernames are real.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'))

// ---- Lookups ----

export async function getUser(id: number): Promise<User | null> {
  const r = await q.one<Row>('SELECT * FROM users WHERE id = ?', id)
  return r ? toUser(r) : null
}

/** The user behind a session, only while the account is active. Read fresh on every call, so revoked rights apply at once. */
export async function activeUser(id: number | null | undefined): Promise<User | null> {
  if (!id) return null
  const u = await getUser(id)
  return u?.active ? u : null
}

export const hasUsers = async () => !!(await q.one('SELECT 1 FROM users LIMIT 1'))

export async function verifyLogin(username: string, password: string): Promise<User> {
  const r = await q.one<Row>('SELECT * FROM users WHERE lower(username) = lower(?)', String(username ?? '').trim())
  const ok = checkPassword(String(password ?? ''), r?.password_hash ?? DUMMY_HASH)
  if (!r || !ok) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
  if (!r.active) throw new Error('هذا الحساب موقوف. تواصل مع المسؤول')
  const now = await nowLocal()
  await q.run('UPDATE users SET last_login = ? WHERE id = ?', now, r.id)
  return toUser({ ...r, last_login: now })
}

// ---- Website sessions ----

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const SESSION_END = SQL_NOW.replace('now()', `(now() + interval '${SESSION_DAYS} days')`) // parentheses: AT TIME ZONE binds tighter than +

export async function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  await q.run(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ${SESSION_END})`, sha256(token), userId)
  await q.run(`DELETE FROM sessions WHERE expires_at < ${SQL_NOW}`)
  return { token, maxAgeSeconds: SESSION_DAYS * 86400 }
}

export async function sessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null
  const row = await q.one<{ user_id: number }>(`SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ${SQL_NOW}`, sha256(token))
  return activeUser(row?.user_id)
}

export async function deleteSession(token: string | undefined) {
  if (token) await q.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
}

const endSessionsOf = (userId: number) => q.run('DELETE FROM sessions WHERE user_id = ?', userId)

// ---- Wrong-password lockout (in the database, so it holds across every server instance) ----

export async function assertNotLocked(key: string) {
  const r = await q.one<{ locked_until: number }>('SELECT locked_until FROM login_attempts WHERE key = ?', key)
  if (r && r.locked_until > Date.now()) throw new Error('محاولات كثيرة خاطئة. حاول بعد 15 دقيقة')
}

export async function noteLoginFail(key: string) {
  await q.run(`INSERT INTO login_attempts (key, fails) VALUES (?, 1)
    ON CONFLICT (key) DO UPDATE SET fails = login_attempts.fails + 1`, key)
  await q.run('UPDATE login_attempts SET fails = 0, locked_until = ? WHERE key = ? AND fails >= ?', Date.now() + LOCK_MS, key, LOCK_AFTER)
}

export const clearLoginFails = (key: string) => q.run('DELETE FROM login_attempts WHERE key = ?', key)

// ---- Account management ----

function cleanUsername(username: string) {
  const u = String(username ?? '').trim()
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(u)) throw new Error('اسم المستخدم: 3 إلى 32 حرفاً إنجليزياً أو رقماً (يسمح بـ . _ -)')
  return u
}

async function assertUsernameFree(username: string, exceptId = 0) {
  if (await q.one('SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?', username, exceptId)) throw new Error('اسم المستخدم مستخدم لحساب آخر')
}

const activeSuperAdmins = async () => (await q.one<{ c: number }>("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND active = 1"))!.c

/** The very first account (website setup). Always a super admin. */
export async function createFirstSuperAdmin(input: { username: string; name: string; password: string }): Promise<User> {
  const username = cleanUsername(input.username)
  const name = String(input.name ?? '').trim() || username
  const hash = hashPassword(validPassword(input.password))
  const id = await tx(async () => {
    // Serialise concurrent first-time setups: only one can create the first account.
    await q.run('LOCK TABLE users IN EXCLUSIVE MODE')
    if (await hasUsers()) throw new Error('تم إنشاء حساب المسؤول مسبقاً')
    return q.insert("INSERT INTO users (username, name, password_hash, role, permissions) VALUES (?, ?, ?, 'super_admin', '[]')", username, name, hash)
  })
  return (await getUser(id))!
}

export async function listUsers(actor: User): Promise<User[]> {
  if (actor.role === 'employee') throw new Error('لا تملك صلاحية إدارة المستخدمين')
  const rows = await q.all<Row>("SELECT * FROM users ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name")
  return rows.map(toUser)
}

/** Super admins manage everyone; admins manage employees only. */
function assertCanManage(actor: User, target: { role: Role }) {
  if (actor.role === 'super_admin') return
  if (actor.role === 'admin' && target.role === 'employee') return
  throw new Error(actor.role === 'admin' ? 'الأدمن يدير حسابات الموظفين فقط' : 'لا تملك صلاحية إدارة المستخدمين')
}

export async function saveUser(actor: User, input: UserInput & { id?: number }): Promise<User> {
  const role = ROLES.includes(input.role) ? input.role : 'employee'
  const username = cleanUsername(input.username)
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('الاسم مطلوب')
  await assertUsernameFree(username, input.id)

  if (!input.id) {
    assertCanManage(actor, { role })
    // Only a super admin decides permissions; an admin's new employee gets the defaults.
    const perms = actor.role === 'super_admin' ? cleanPermissions(input.permissions) : DEFAULT_EMPLOYEE_PERMISSIONS
    const id = await q.insert('INSERT INTO users (username, name, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)',
      username, name, hashPassword(validPassword(input.password)), role, JSON.stringify(role === 'super_admin' ? [] : perms))
    return (await getUser(id))!
  }

  const before = await getUser(input.id)
  if (!before) throw new Error('المستخدم غير موجود')
  const self = before.id === actor.id
  if (!self) assertCanManage(actor, before)

  let newRole = before.role
  let perms = before.permissions
  if (actor.role === 'super_admin') {
    newRole = role
    perms = cleanPermissions(input.permissions)
    if (self && newRole !== 'super_admin') throw new Error('لا يمكنك إزالة صلاحية السوبر أدمن عن نفسك')
  } else if (role !== before.role || cleanPermissions(input.permissions).join() !== before.permissions.join()) {
    throw new Error('منح الصلاحيات وسحبها للسوبر أدمن فقط')
  }

  await tx(async () => {
    await q.run('UPDATE users SET username = ?, name = ?, role = ?, permissions = ? WHERE id = ?',
      username, name, newRole, JSON.stringify(newRole === 'super_admin' ? [] : perms), before.id)
    if (input.password) {
      await q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(validPassword(input.password)), before.id)
      if (!self) await endSessionsOf(before.id) // a reset password logs them out everywhere
    }
  })
  return (await getUser(before.id))!
}

export async function setUserActive(actor: User, id: number, active: boolean): Promise<User> {
  const target = await getUser(id)
  if (!target) throw new Error('المستخدم غير موجود')
  if (target.id === actor.id) throw new Error('لا يمكنك إيقاف حسابك')
  assertCanManage(actor, target)
  if (!active && target.role === 'super_admin' && (await activeSuperAdmins()) <= 1) throw new Error('يجب أن يبقى سوبر أدمن واحد فعّال على الأقل')
  await q.run('UPDATE users SET active = ? WHERE id = ?', active ? 1 : 0, id)
  if (!active) await endSessionsOf(id)
  return (await getUser(id))!
}

export async function deleteUser(actor: User, id: number) {
  if (actor.role !== 'super_admin') throw new Error('حذف الحسابات للسوبر أدمن فقط')
  if (id === actor.id) throw new Error('لا يمكنك حذف حسابك')
  const target = await getUser(id)
  if (!target) return
  if (target.role === 'super_admin' && target.active && (await activeSuperAdmins()) <= 1) throw new Error('يجب أن يبقى سوبر أدمن واحد فعّال على الأقل')
  await q.run('DELETE FROM users WHERE id = ?', id)
}

export async function changeOwnPassword(actor: User, current: string, next: string) {
  const r = await q.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', actor.id)
  if (!r || !checkPassword(String(current ?? ''), r.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة')
  await q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(validPassword(next)), actor.id)
}
