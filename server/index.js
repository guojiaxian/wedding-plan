import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  db, listAll, getOne, pick, insertRow, updateRow, deleteRow,
  clearData, seedTemplate, isEmpty, isSeeded, markSeeded, localDate, seedTimeline,
  migrateDecorationAreas
} from './db.js'
import {
  SESSION_COOKIE, SESSION_MAX_AGE_MS, ensureAdminUser, createSession, getSessionUser,
  destroySession, findUserByName, findUserById, verifyPassword, updatePassword,
  createUser, setOnboarded
} from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------- .env 加载（自包含配置；systemd 亦通过 EnvironmentFile 注入，手动运行同样生效） ----------
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || m[1].startsWith('#') || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
// 项目根 .env 优先（生产 PORT=80 / 开发 PORT=19002）；兼容旧的 server/.env
loadDotEnv(path.join(__dirname, '..', '.env'))
loadDotEnv(path.join(__dirname, '.env'))

// 首次启动创建 admin 账号（放在 .env 加载之后，以便读取 ADMIN_PASSWORD）
ensureAdminUser()

// ---------- 文件日志：logs/ 按天轮转，保留 14 天（自包含，不依赖系统 logrotate） ----------
const LOG_DIR = path.join(__dirname, 'logs')
const LOG_RETENTION_DAYS = 14
fs.mkdirSync(LOG_DIR, { recursive: true })
function pruneLogs() {
  try {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
    for (const f of fs.readdirSync(LOG_DIR)) {
      const p = path.join(LOG_DIR, f)
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p)
    }
  } catch { /* 日志清理失败不影响服务 */ }
}
pruneLogs()
setInterval(pruneLogs, 6 * 3600 * 1000).unref()

for (const m of ['log', 'error']) {
  const orig = console[m].bind(console)
  console[m] = (...args) => {
    orig(...args)
    try {
      const stamp = new Date().toISOString()
      const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      fs.appendFileSync(path.join(LOG_DIR, `wedding-${localDate()}.log`), `[${stamp}] ${line}\n`)
    } catch { /* 忽略写日志异常 */ }
  }
}

const startedAt = Date.now()
const app = express()
app.use(express.json({ limit: '10mb' }))

// ---------- 健康检查（部署自检清单要求） ----------
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  app: 'wedding-plan',
  uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  time: new Date().toISOString()
}))

// ---------- 每日数据库备份：backups/ 内保留最近 30 份（VACUUM INTO 生成快照，含 WAL 数据） ----------
const BACKUP_DIR = path.join(__dirname, 'backups')
const BACKUP_KEEP = 30
fs.mkdirSync(BACKUP_DIR, { recursive: true })
function backupDB() {
  try {
    const target = path.join(BACKUP_DIR, `wedding-${localDate()}.db`)
    if (fs.existsSync(target)) return
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort()
    while (files.length > BACKUP_KEEP) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()))
    console.log(`已生成数据库备份: ${path.basename(target)}（保留最近 ${BACKUP_KEEP} 份）`)
  } catch (e) { console.error('数据库备份失败:', e.message) }
}
backupDB()
setInterval(backupDB, 6 * 3600 * 1000).unref()

// ---------- 资源字段白名单 ----------
const SCHEMA = {
  'item-categories': { table: 'item_categories', fields: ['key', 'name', 'icon', 'sort'], order: 'sort, id' },
  'budget-categories': { table: 'budget_categories', fields: ['name', 'budget', 'paid', 'sort'], order: 'sort, id' },
  expenses: { table: 'expenses', fields: ['category_id', 'name', 'amount', 'date', 'note'], order: 'date DESC, id DESC' },
  items: { table: 'items', fields: ['category', 'name', 'budget_category_id', 'estimated_price', 'actual_price', 'purchased', 'channel', 'note', 'sort'], order: 'sort, id' },
  tasks: { table: 'tasks', fields: ['title', 'phase', 'due_date', 'status', 'assignee', 'note', 'sort'], order: 'sort, id' },
  timeline: { table: 'timeline_events', fields: ['time', 'title', 'duration', 'location', 'owner', 'note', 'sort'], order: 'sort, id' },
  staff: { table: 'staff', fields: ['name', 'role', 'phone', 'duty', 'event_title'], order: 'id' },
  guests: { table: 'guests', fields: ['name', 'side', 'grp', 'relationship', 'phone', 'rsvp', 'count', 'table_no', 'gift', 'note'], order: 'id' },
  decorations: { table: 'decorations', fields: ['area', 'name', 'done', 'source', 'note', 'sort'], order: 'sort, id' },
  'decoration-images': { table: 'decoration_images', fields: ['decoration_id', 'name', 'thumb', 'data'], order: 'id' }
}

const api = express.Router()

// ---------- 登录认证 ----------
function readCookie(req, name) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return ''
}

function normalizeUsername(raw) {
  const username = String(raw || '').trim()
  if (username.length < 2 || username.length > 24) return { error: '账号名称需为 2-24 个字符' }
  if (!/^[\w\u4e00-\u9fa5.@-]+$/.test(username)) {
    return { error: '账号名称支持中文、字母、数字及 _ . @ -' }
  }
  return { username }
}

api.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = findUserByName(username)
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '账号或密码错误' })
  }
  const token = createSession(user.id)
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS
  })
  res.json({ user: { id: user.id, username: user.username, onboarded: !!user.onboarded } })
})

// 注册新账号：密码长度不限（非空即可）
api.post('/auth/register', (req, res) => {
  const { password } = req.body || {}
  const check = normalizeUsername(req.body?.username)
  if (check.error) return res.status(400).json({ error: check.error })
  const pwd = String(password ?? '')
  if (!pwd) return res.status(400).json({ error: '请输入密码' })
  if (findUserByName(check.username)) {
    return res.status(400).json({ error: '该账号名称已被使用' })
  }
  const user = createUser(check.username, pwd)
  const token = createSession(user.id)
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS
  })
  res.json({ user })
})

// 分享链接：无登录、只读；令牌存于 users 表，每个账号独立
const SHARE_SECTIONS = ['overview', 'budget', 'items', 'tasks', 'timeline', 'decorations', 'seats', 'staff', 'guests']

function parseShareSections(raw) {
  if (!raw) return [...SHARE_SECTIONS]
  try {
    const list = JSON.parse(raw)
    const valid = SHARE_SECTIONS.filter(k => Array.isArray(list) && list.includes(k))
    return valid.length ? valid : [...SHARE_SECTIONS]
  } catch {
    return [...SHARE_SECTIONS]
  }
}

function getShareToken(userId) {
  return db.prepare('SELECT share_token FROM users WHERE id = ?').get(userId)?.share_token || ''
}

function getShareSections(userId) {
  return parseShareSections(db.prepare('SELECT share_sections FROM users WHERE id = ?').get(userId)?.share_sections)
}

function ensureShareToken(userId) {
  let token = getShareToken(userId)
  if (!token) {
    token = crypto.randomBytes(24).toString('hex')
    db.prepare('UPDATE users SET share_token = ? WHERE id = ?').run(token, userId)
  }
  return token
}

function getSettings(userId) {
  db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId)
  return db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId)
}

// 公开只读快照（必须在鉴权中间件之前注册）
api.get('/share/:token', (req, res) => {
  const owner = db.prepare('SELECT id, username, share_sections FROM users WHERE share_token = ?').get(req.params.token)
  if (!owner) {
    return res.status(404).json({ error: '分享链接无效或已失效' })
  }
  const sections = parseShareSections(owner.share_sections)
  const has = k => sections.includes(k)
  const uid = owner.id
  res.json({
    owner: owner.username,
    settings: getSettings(uid),
    sections,
    summary: buildSummary(uid),
    budgetCategories: has('budget') ? listAll('budget_categories', 'sort, id', uid) : [],
    itemCategories: has('items') ? listAll('item_categories', 'sort, id', uid) : [],
    items: has('items') ? listAll('items', 'sort, id', uid) : [],
    expenses: has('budget') ? listAll('expenses', 'id DESC', uid) : [],
    tasks: has('tasks') ? listAll('tasks', 'sort, id', uid) : [],
    timeline: has('timeline') ? listAll('timeline_events', 'sort, id', uid) : [],
    staff: has('staff') ? listAll('staff', 'id', uid) : [],
    guests: has('guests') || has('seats') ? listAll('guests', 'id', uid) : [],
    decorations: has('decorations') ? listDecorationsWithImages(uid) : []
  })
})

// 分享页按需加载参考图原图（同样凭分享令牌访问；未开放布置栏目时不可访问）
api.get('/share/:token/images/:id', (req, res) => {
  const owner = db.prepare('SELECT id FROM users WHERE share_token = ?').get(req.params.token)
  if (!owner) {
    return res.status(404).json({ error: '分享链接无效或已失效' })
  }
  if (!getShareSections(owner.id).includes('decorations')) {
    return res.status(404).json({ error: '该栏目未开放' })
  }
  const row = getOne('decoration_images', req.params.id, owner.id)
  if (!row) return res.status(404).json({ error: '图片不存在' })
  res.json(row)
})

// 除登录、分享快照外的所有 API 都需要有效会话
api.use((req, res, next) => {
  const token = readCookie(req, SESSION_COOKIE)
  const user = getSessionUser(token)
  if (!user) return res.status(401).json({ error: '请先登录' })
  req.user = user
  req.sessionToken = token
  next()
})

api.get('/auth/me', (req, res) => res.json({ user: req.user }))

api.post('/auth/logout', (req, res) => {
  destroySession(req.sessionToken)
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
})

// 修改密码：保持其他设备已登录状态（密码长度不限）
api.post('/auth/password', (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  const user = findUserById(req.user.id)
  if (!user || !verifyPassword(oldPassword, user.password_hash)) {
    return res.status(400).json({ error: '当前密码不正确' })
  }
  const next = String(newPassword ?? '')
  if (!next) {
    return res.status(400).json({ error: '请输入新密码' })
  }
  if (next === String(oldPassword)) {
    return res.status(400).json({ error: '新密码不能与当前密码相同' })
  }
  updatePassword(user.id, next)
  res.json({ ok: true })
})

// 修改账号名称（登录用户名）
api.post('/auth/username', (req, res) => {
  const check = normalizeUsername(req.body?.username)
  if (check.error) return res.status(400).json({ error: check.error })
  const exists = findUserByName(check.username)
  if (exists && exists.id !== req.user.id) {
    return res.status(400).json({ error: '该账号名称已被使用' })
  }
  db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?')
    .run(check.username, new Date().toISOString(), req.user.id)
  res.json({ user: { ...req.user, username: check.username } })
})

// 首次注册后的基础设置（可跳过）
api.post('/auth/onboarding', (req, res) => {
  const skip = !!req.body?.skip
  if (!skip) {
    const current = getSettings(req.user.id)
    const data = {
      ...current,
      ...sanitize('settings', pick(req.body?.settings || {}, ['groom_name', 'bride_name', 'wedding_date', 'venue', 'total_budget']))
    }
    db.prepare(`UPDATE user_settings SET groom_name=?, bride_name=?, wedding_date=?, venue=?, total_budget=? WHERE user_id=?`)
      .run(data.groom_name || '', data.bride_name || '', data.wedding_date || '', data.venue || '', Number(data.total_budget) || 0, req.user.id)
  }
  setOnboarded(req.user.id)
  res.json({ user: { ...req.user, onboarded: true } })
})

// 获取分享令牌（首次调用时生成）
api.get('/share-link', (req, res) => {
  res.json({ token: ensureShareToken(req.user.id) })
})

// 分享栏目设置
api.get('/share-settings', (req, res) => {
  res.json({ sections: getShareSections(req.user.id) })
})

api.put('/share-settings', (req, res) => {
  const input = Array.isArray(req.body?.sections) ? req.body.sections : []
  const sections = [...new Set(SHARE_SECTIONS.filter(k => input.includes(k)))]
  if (!sections.length) {
    return res.status(400).json({ error: '至少保留一个分享栏目' })
  }
  db.prepare('UPDATE users SET share_sections = ? WHERE id = ?').run(JSON.stringify(sections), req.user.id)
  res.json({ sections })
})

// ---------- 服务端输入净化（前端校验之外的最后一道防线） ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const numGE0 = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v) * 100) / 100) : 0)
const SANITIZERS = {
  guests(d) {
    if ('count' in d) d.count = Math.min(20, Math.max(1, Number(d.count) || 1))
    if ('gift' in d && d.gift !== null) d.gift = numGE0(d.gift)
    if ('rsvp' in d && !['pending', 'yes', 'no'].includes(d.rsvp)) d.rsvp = 'pending'
    if ('side' in d && !['groom', 'bride', 'common'].includes(d.side)) d.side = 'common'
  },
  expenses(d) {
    if ('amount' in d) d.amount = numGE0(d.amount)
    if ('date' in d && d.date && !DATE_RE.test(d.date)) d.date = ''
  },
  items(d) {
    if ('estimated_price' in d) d.estimated_price = numGE0(d.estimated_price)
    if ('actual_price' in d && d.actual_price !== null) d.actual_price = numGE0(d.actual_price)
    if ('purchased' in d) d.purchased = d.purchased ? 1 : 0
  },
  budget_categories(d) {
    if ('budget' in d) d.budget = numGE0(d.budget)
    if ('paid' in d) d.paid = numGE0(d.paid)
  },
  item_categories(d) { if ('name' in d && !String(d.name).trim()) d.name = '未命名分类' },
  tasks(d) {
    if ('status' in d && !['todo', 'doing', 'done'].includes(d.status)) d.status = 'todo'
    if ('phase' in d && !['m12', 'm9', 'm6', 'm3', 'm1', 'w1'].includes(d.phase)) d.phase = 'm6'
    if ('due_date' in d && d.due_date && !DATE_RE.test(d.due_date)) d.due_date = ''
  },
  decorations(d) { if ('done' in d) d.done = d.done ? 1 : 0 },
  decoration_images(d) {
    // 只接受 data URL 形式的图片；文件名限长，防止异常写入
    for (const k of ['thumb', 'data']) if (k in d && d[k] && !String(d[k]).startsWith('data:image/')) d[k] = ''
    if ('name' in d) d.name = String(d.name ?? '').slice(0, 200)
  },
  settings(d) {
    if ('total_budget' in d) d.total_budget = numGE0(d.total_budget)
    if ('wedding_date' in d && d.wedding_date && !DATE_RE.test(d.wedding_date)) d.wedding_date = ''
  },
  timeline_events() {},
  staff() {}
}
function sanitize(table, data) {
  SANITIZERS[table]?.(data)
  return data
}

// ---------- 现场布置参考图（自定义路由，优先于下方通用 CRUD 注册） ----------
// 布置清单附带每项的参考图缩略图（不含原图 data，保持列表轻量；原图按 id 懒加载）
function listDecorationsWithImages(userId) {
  const rows = listAll('decorations', SCHEMA.decorations.order, userId)
  const imgs = db.prepare('SELECT id, decoration_id, name, thumb FROM decoration_images WHERE user_id = ? ORDER BY id').all(userId)
  const byDeco = new Map()
  for (const im of imgs) {
    if (!byDeco.has(im.decoration_id)) byDeco.set(im.decoration_id, [])
    byDeco.get(im.decoration_id).push({ id: im.id, name: im.name, thumb: im.thumb })
  }
  return rows.map(r => ({ ...r, images: byDeco.get(r.id) || [] }))
}

api.get('/decorations', (req, res) => res.json(listDecorationsWithImages(req.user.id)))

// 单张原图（点开大图时懒加载）
api.get('/decoration-images/:id', (req, res) => {
  const row = getOne('decoration_images', req.params.id, req.user.id)
  if (!row) return res.status(404).json({ error: '图片不存在' })
  res.json(row)
})

// 通用 CRUD（全部按当前账号隔离）
for (const [route, conf] of Object.entries(SCHEMA)) {
  api.get(`/${route}`, (req, res) => res.json(listAll(conf.table, conf.order, req.user.id)))

  api.post(`/${route}`, (req, res) => {
    try {
      const data = sanitize(conf.table, pick(req.body, conf.fields))
      // 物品自定义分类：未提供 key 时自动生成唯一 key
      if (conf.table === 'item_categories' && !data.key) {
        data.key = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      }
      // 参考图必须挂在已存在的布置项上，且带有效图片数据
      if (conf.table === 'decoration_images') {
        data.decoration_id = Number(data.decoration_id) || 0
        if (!getOne('decorations', data.decoration_id, req.user.id)) return res.status(400).json({ error: '布置项不存在' })
        if (!data.data) return res.status(400).json({ error: '图片数据为空' })
      }
      res.json(insertRow(conf.table, conf.fields, data, req.user.id))
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  api.put(`/${route}/:id`, (req, res) => {
    const row = getOne(conf.table, req.params.id, req.user.id)
    if (!row) return res.status(404).json({ error: '记录不存在' })
    res.json(updateRow(conf.table, conf.fields, req.params.id, sanitize(conf.table, pick(req.body, conf.fields)), req.user.id))
  })

  api.delete(`/${route}/:id`, (req, res) => {
    // 删除物品分类时，可将该分类下的物品迁移到另一分类（?moveTo=<key>）；至少保留一个分类
    if (conf.table === 'item_categories') {
      const total = Number(db.prepare('SELECT COUNT(*) AS n FROM item_categories WHERE user_id = ?').get(req.user.id).n)
      if (total <= 1) return res.status(400).json({ error: '至少保留一个物品分类' })
      const row = getOne('item_categories', req.params.id, req.user.id)
      const moveTo = String(req.query.moveTo || '')
      if (row && moveTo) db.prepare('UPDATE items SET category = ? WHERE category = ? AND user_id = ?').run(moveTo, row.key, req.user.id)
    }
    // 删除布置项时级联清理其参考图
    if (conf.table === 'decorations') {
      db.prepare('DELETE FROM decoration_images WHERE decoration_id = ? AND user_id = ?').run(req.params.id, req.user.id)
    }
    deleteRow(conf.table, req.params.id, req.user.id)
    res.json({ ok: true })
  })
}

// ---------- 设置 ----------
api.get('/settings', (req, res) => res.json(getSettings(req.user.id)))
api.put('/settings', (req, res) => {
  const data = sanitize('settings', pick(req.body, ['groom_name', 'bride_name', 'wedding_date', 'venue', 'total_budget']))
  const current = getSettings(req.user.id)
  const merged = { ...current, ...data }
  db.prepare(`UPDATE user_settings SET groom_name=?, bride_name=?, wedding_date=?, venue=?, total_budget=? WHERE user_id=?`)
    .run(merged.groom_name || '', merged.bride_name || '', merged.wedding_date || '', merged.venue || '', Number(merged.total_budget) || 0, req.user.id)
  res.json(getSettings(req.user.id))
})

// ---------- 仪表盘聚合 ----------
function buildSummary(userId) {
  const cats = listAll('budget_categories', 'sort, id', userId)
  const expenses = listAll('expenses', 'id DESC', userId)
  const items = listAll('items', 'sort, id', userId)

  // 已付口径：花销项「已付」累计 + 已购物品自动计入（仅限挂在现存花销分类上的物品）
  // 分类被删后物品不再计入任何花销；expenses 表仅余未分类记录（一并计入总数）
  const catIds = new Set(cats.map(c => c.id))
  const catSpent = {}
  for (const c of cats) catSpent[c.id] = Number(c.paid) || 0
  for (const it of items) {
    if (it.purchased && catIds.has(it.budget_category_id)) {
      catSpent[it.budget_category_id] += it.actual_price ?? it.estimated_price ?? 0
    }
  }

  const totalSpent = cats.reduce((s, c) => s + (Number(c.paid) || 0), 0)
    + items.filter(i => i.purchased && catIds.has(i.budget_category_id)).reduce((s, i) => s + (i.actual_price ?? i.estimated_price ?? 0), 0)
    + expenses.filter(e => e.category_id == null).reduce((s, e) => s + (e.amount || 0), 0)

  const tasks = listAll('tasks', 'sort, id', userId)
  const guests = listAll('guests', 'id', userId)
  const decorations = listAll('decorations', 'sort, id', userId)

  const rsvpCount = { pending: 0, yes: 0, no: 0 }
  let confirmedHeads = 0, invitedHeads = 0, giftTotal = 0
  for (const g of guests) {
    rsvpCount[g.rsvp] = (rsvpCount[g.rsvp] || 0) + 1
    const n = Number(g.count) || 1
    invitedHeads += n
    if (g.rsvp === 'yes') confirmedHeads += n
    giftTotal += Number(g.gift) || 0
  }

  return {
    budget: {
      totalBudget: Number(getSettings(userId).total_budget) || 0,
      totalSpent,
      categories: cats.map(c => ({ ...c, spent: catSpent[c.id] || 0 }))
    },
    tasks: {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      doing: tasks.filter(t => t.status === 'doing').length,
      done: tasks.filter(t => t.status === 'done').length
    },
    items: {
      total: items.length,
      purchased: items.filter(i => i.purchased).length,
      estimatedTotal: items.reduce((s, i) => s + (i.estimated_price || 0), 0),
      actualTotal: items.filter(i => i.purchased).reduce((s, i) => s + (i.actual_price ?? i.estimated_price ?? 0), 0)
    },
    guests: { total: guests.length, ...rsvpCount, confirmedHeads, invitedHeads, giftTotal },
    decorations: { total: decorations.length, done: decorations.filter(d => d.done).length },
    upcoming: tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1)
      .slice(0, 5)
  }
}

api.get('/summary', (req, res) => res.json(buildSummary(req.user.id)))

// ---------- 备份 / 恢复 ----------

api.get('/backup', (req, res) => {
  const uid = req.user.id
  const stripUser = ({ user_id, ...rest }) => rest
  const data = { app: 'wedding-plan', version: 1, exportedAt: new Date().toISOString() }
  const settings = getSettings(uid)
  data.settings = [{ ...stripUser(settings), id: 1 }]
  for (const conf of Object.values(SCHEMA)) {
    data[conf.table] = db.prepare(`SELECT * FROM ${conf.table} WHERE user_id = ? ORDER BY id`).all(uid).map(stripUser)
  }
  res.setHeader('Content-Disposition', `attachment; filename="wedding-backup-${Date.now()}.json"`)
  res.json(data)
})

api.post('/backup', (req, res) => {
  const data = req.body
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '无效的备份文件' })
  const uid = req.user.id
  db.exec('BEGIN')
  try {
    clearData(uid)
    getSettings(uid)
    const s = data.settings?.[0]
    if (s) {
      db.prepare('UPDATE user_settings SET groom_name=?, bride_name=?, wedding_date=?, venue=?, total_budget=? WHERE user_id=?')
        .run(s.groom_name || '', s.bride_name || '', s.wedding_date || '', s.venue || '', numGE0(s.total_budget), uid)
    }
    // 兼容旧版备份：缺少的表按空数组处理
    const decoIdMap = {} // 参考图重映射：备份里的布置项 id → 恢复后的新 id
    for (const [route, conf] of Object.entries(SCHEMA)) {
      const rows = Array.isArray(data[conf.table]) ? data[conf.table] : []
      for (const row of rows) {
        const clean = sanitize(conf.table, pick(row, conf.fields))
        if (conf.table === 'item_categories' && !clean.key) clean.key = 'r' + Math.random().toString(36).slice(2, 10)
        // 参考图：指向恢复后的布置项；找不到对应布置项则丢弃该图
        if (conf.table === 'decoration_images') {
          clean.decoration_id = decoIdMap[clean.decoration_id] || 0
          if (!clean.decoration_id) continue
        }
        const inserted = insertRow(conf.table, conf.fields, clean, uid)
        if (conf.table === 'decorations') decoIdMap[row.id] = inserted.id
      }
    }
    // 旧版备份把付款逐笔存在 expenses：折算进对应花销项「已付」后清除（新版备份已含 paid，折算为零增量）
    db.prepare(`
      UPDATE budget_categories SET paid = paid + (
        SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.category_id = budget_categories.id
      ) WHERE user_id = ?
    `).run(uid)
    db.prepare('DELETE FROM expenses WHERE user_id = ? AND category_id IS NOT NULL').run(uid)
    db.exec('COMMIT')
    migrateDecorationAreas(uid) // 旧版备份可能仍是旧区域键（photo/ceremony），恢复后归一到新四区
    res.json({ ok: true })
  } catch (e) {
    db.exec('ROLLBACK')
    res.status(400).json({ error: e.message })
  }
})

// ---------- 模板 ----------
api.post('/seed/reset', (req, res) => { seedTemplate(req.user.id); res.json({ ok: true }) })
api.post('/seed/clear', (req, res) => { clearData(req.user.id); res.json({ ok: true }) })
api.post('/timeline/template', (req, res) => { seedTimeline(req.user.id); res.json({ ok: true }) })

// 未知 API 路由返回 JSON 404（避免命中 SPA 回退返回 HTML 导致前端解析困惑）
api.use((_req, res) => res.status(404).json({ error: '接口不存在' }))

app.use('/api', api)
// 请求体 JSON 解析失败等框架级错误返回 400（此前一律 500）
app.use((err, _req, res, _next) => res.status(err.status || err.statusCode || 500).json({ error: err.message }))

// ---------- 生产模式：托管前端构建产物 ----------
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

// 默认使用开发端口 19002；生产机由根目录 .env / systemd EnvironmentFile 注入 PORT=80
// 需要更换时：PORT=xxxx node server/index.js
const PORT = Number(process.env.PORT) || 19002
const HOST = process.env.HOST || '0.0.0.0'

function lanIPv4s() {
  const out = []
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address)
    }
  }
  return out
}

// 首次初始化：以 meta 表标记为准 —— 防止用户「清空数据」后重启服务时模板数据复活
const firstUserId = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id
if (!isSeeded() && firstUserId) {
  if (isEmpty()) {
    seedTemplate(firstUserId)
    console.log('首次启动：已载入备婚模板数据')
  } else {
    markSeeded()
  }
}
// 现场布置区域归一（旧五区 → 新四区），幂等：逐账号执行，仅在存在旧区域键时修改
for (const u of db.prepare('SELECT id FROM users').all()) migrateDecorationAreas(u.id)
const server = app.listen(PORT, HOST, () => {
  console.log(`备婚计划服务已启动（监听 ${HOST}:${PORT}，数据独立存放于 server/data/）`)
  console.log(`  本机访问: http://localhost:${PORT}`)
  const ips = lanIPv4s()
  for (const ip of ips) console.log(`  局域网访问: http://${ip}:${PORT}`)
})
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用（可能被同机其他应用使用）。请换端口启动：PORT=8400 node server/index.js`)
  } else {
    console.error('启动失败:', err.message)
  }
  process.exit(1)
})
