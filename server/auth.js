import crypto from 'node:crypto'
import { db } from './db.js'

export const SESSION_COOKIE = 'wp_sid'
// 会话永久有效：数据库不设过期；浏览器 Cookie 上限约 400 天
const SESSION_DAYS = 400
export const SESSION_MAX_AGE_MS = SESSION_DAYS * 86400000

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

// 密码哈希：scrypt + 随机盐，格式 scrypt$<salt>$<hash>
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const actual = crypto.scryptSync(String(password), salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// 首次启动创建 admin（已有账号则不动）；初始密码优先取 ADMIN_PASSWORD
export function ensureAdminUser() {
  if (db.prepare('SELECT id FROM users LIMIT 1').get()) return
  const now = new Date().toISOString()
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  db.prepare('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?,?,?,?)')
    .run('admin', hashPassword(password), now, now)
  console.log('已创建默认账号 admin（未配置 ADMIN_PASSWORD 时初始密码为 admin123，请登录后修改）')
}

export function findUserByName(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim())
}

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

// 每次登录生成独立会话，同一账号可同时登录多台设备；会话永久有效（仅手动退出时销毁）
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), userId, now, 0)
  return token
}

export function getSessionUser(token) {
  if (!token) return null
  const row = db.prepare(`
    SELECT u.id, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token))
  if (!row) return null
  return { id: row.id, username: row.username }
}

export function destroySession(token) {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function updatePassword(userId, password) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(password), new Date().toISOString(), userId)
}
