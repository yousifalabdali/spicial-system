// Accounts, passwords and the rules for who may manage whom.
// Every function that changes accounts takes the acting user and checks the rules itself,
// so they hold no matter which screen (or HTTP request) called them.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getDb, nowLocal } from './index'
import { ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS, type Permission, type Role, type User, type UserInput } from '../../shared/auth'

const db = () => getDb()
const SESSION_DAYS = 30
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

export function getUser(id: number): User | null {
  const r = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined
  return r ? toUser(r) : null
}

/** The user behind a session, only while the account is active. Read fresh on every call, so revoked rights apply at once. */
export function activeUser(id: number | null | undefined): User | null {
  if (!id) return null
  const u = getUser(id)
  return u?.active ? u : null
}

export const hasUsers = () => !!db().prepare('SELECT 1 FROM users LIMIT 1').get()

export function verifyLogin(username: string, password: string): User {
  const r = db().prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim()) as Row | undefined
  const ok = checkPassword(String(password ?? ''), r?.password_hash ?? DUMMY_HASH)
  if (!r || !ok) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
  if (!r.active) throw new Error('هذا الحساب موقوف. تواصل مع المسؤول')
  const now = nowLocal()
  db().prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, r.id)
  return toUser({ ...r, last_login: now })
}

// ---- Website sessions ----

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  db().prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now','localtime','+${SESSION_DAYS} days'))`).run(sha256(token), userId)
  db().prepare("DELETE FROM sessions WHERE expires_at < datetime('now','localtime')").run()
  return { token, maxAgeSeconds: SESSION_DAYS * 86400 }
}

export function sessionUser(token: string | undefined): User | null {
  if (!token) return null
  const row = db().prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now','localtime')").get(sha256(token)) as { user_id: number } | undefined
  return activeUser(row?.user_id)
}

export function deleteSession(token: string | undefined) {
  if (token) db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

const endSessionsOf = (userId: number) => db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)

// ---- Account management ----

function cleanUsername(username: string) {
  const u = String(username ?? '').trim()
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(u)) throw new Error('اسم المستخدم: 3 إلى 32 حرفاً إنجليزياً أو رقماً (يسمح بـ . _ -)')
  return u
}

function assertUsernameFree(username: string, exceptId = 0) {
  if (db().prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, exceptId)) throw new Error('اسم المستخدم مستخدم لحساب آخر')
}

const activeSuperAdmins = () => (db().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND active = 1").get() as { c: number }).c

/** The very first account (desktop first run, or website setup). Always a super admin. */
export function createFirstSuperAdmin(input: { username: string; name: string; password: string }): User {
  if (hasUsers()) throw new Error('تم إنشاء حساب المسؤول مسبقاً')
  const username = cleanUsername(input.username)
  const name = String(input.name ?? '').trim() || username
  const id = db().prepare("INSERT INTO users (username, name, password_hash, role, permissions) VALUES (?, ?, ?, 'super_admin', '[]')")
    .run(username, name, hashPassword(validPassword(input.password))).lastInsertRowid
  return getUser(Number(id))!
}

export function listUsers(actor: User): User[] {
  if (actor.role === 'employee') throw new Error('لا تملك صلاحية إدارة المستخدمين')
  const rows = db().prepare("SELECT * FROM users ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name").all() as Row[]
  return rows.map(toUser)
}

/** Super admins manage everyone; admins manage employees only. */
function assertCanManage(actor: User, target: { role: Role }) {
  if (actor.role === 'super_admin') return
  if (actor.role === 'admin' && target.role === 'employee') return
  throw new Error(actor.role === 'admin' ? 'الأدمن يدير حسابات الموظفين فقط' : 'لا تملك صلاحية إدارة المستخدمين')
}

export function saveUser(actor: User, input: UserInput & { id?: number }): User {
  const role = ROLES.includes(input.role) ? input.role : 'employee'
  const username = cleanUsername(input.username)
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('الاسم مطلوب')
  assertUsernameFree(username, input.id)

  if (!input.id) {
    assertCanManage(actor, { role })
    // Only a super admin decides permissions; an admin's new employee gets the defaults.
    const perms = actor.role === 'super_admin' ? cleanPermissions(input.permissions) : DEFAULT_EMPLOYEE_PERMISSIONS
    const id = db().prepare('INSERT INTO users (username, name, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)')
      .run(username, name, hashPassword(validPassword(input.password)), role, JSON.stringify(role === 'super_admin' ? [] : perms)).lastInsertRowid
    return getUser(Number(id))!
  }

  const before = getUser(input.id)
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

  db().transaction(() => {
    db().prepare('UPDATE users SET username = ?, name = ?, role = ?, permissions = ? WHERE id = ?')
      .run(username, name, newRole, JSON.stringify(newRole === 'super_admin' ? [] : perms), before.id)
    if (input.password) {
      db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(validPassword(input.password)), before.id)
      if (!self) endSessionsOf(before.id) // a reset password logs them out everywhere
    }
  })()
  return getUser(before.id)!
}

export function setUserActive(actor: User, id: number, active: boolean): User {
  const target = getUser(id)
  if (!target) throw new Error('المستخدم غير موجود')
  if (target.id === actor.id) throw new Error('لا يمكنك إيقاف حسابك')
  assertCanManage(actor, target)
  if (!active && target.role === 'super_admin' && activeSuperAdmins() <= 1) throw new Error('يجب أن يبقى سوبر أدمن واحد فعّال على الأقل')
  db().prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
  if (!active) endSessionsOf(id)
  return getUser(id)!
}

export function deleteUser(actor: User, id: number) {
  if (actor.role !== 'super_admin') throw new Error('حذف الحسابات للسوبر أدمن فقط')
  if (id === actor.id) throw new Error('لا يمكنك حذف حسابك')
  const target = getUser(id)
  if (!target) return
  if (target.role === 'super_admin' && target.active && activeSuperAdmins() <= 1) throw new Error('يجب أن يبقى سوبر أدمن واحد فعّال على الأقل')
  db().prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function changeOwnPassword(actor: User, current: string, next: string) {
  const r = db().prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id) as { password_hash: string }
  if (!checkPassword(String(current ?? ''), r.password_hash)) throw new Error('كلمة المرور الحالية غير صحيحة')
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(validPassword(next)), actor.id)
}
