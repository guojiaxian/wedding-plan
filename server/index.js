import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  db, listAll, getOne, pick, insertRow, updateRow, deleteRow,
  clearData, seedTemplate, isEmpty, seedTimeline
} from './db.js'

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
loadDotEnv(path.join(__dirname, '.env'))

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
      fs.appendFileSync(path.join(LOG_DIR, `wedding-${stamp.slice(0, 10)}.log`), `[${stamp}] ${line}\n`)
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
    const target = path.join(BACKUP_DIR, `wedding-${new Date().toISOString().slice(0, 10)}.db`)
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
  'budget-categories': { table: 'budget_categories', fields: ['name', 'budget', 'sort'], order: 'sort, id' },
  expenses: { table: 'expenses', fields: ['category_id', 'name', 'amount', 'date', 'note'], order: 'date DESC, id DESC' },
  items: { table: 'items', fields: ['category', 'name', 'budget_category_id', 'estimated_price', 'actual_price', 'purchased', 'channel', 'note', 'sort'], order: 'sort, id' },
  tasks: { table: 'tasks', fields: ['title', 'phase', 'due_date', 'status', 'assignee', 'note', 'sort'], order: 'sort, id' },
  timeline: { table: 'timeline_events', fields: ['time', 'title', 'duration', 'location', 'owner', 'note', 'sort'], order: 'sort, id' },
  staff: { table: 'staff', fields: ['name', 'role', 'phone', 'duty', 'event_title'], order: 'id' },
  guests: { table: 'guests', fields: ['name', 'side', 'grp', 'relationship', 'phone', 'rsvp', 'count', 'table_no', 'gift', 'note'], order: 'id' },
  decorations: { table: 'decorations', fields: ['area', 'name', 'done', 'source', 'note', 'sort'], order: 'sort, id' }
}

const api = express.Router()

// 通用 CRUD
for (const [route, conf] of Object.entries(SCHEMA)) {
  api.get(`/${route}`, (_req, res) => res.json(listAll(conf.table, conf.order)))

  api.post(`/${route}`, (req, res) => {
    try {
      const data = pick(req.body, conf.fields)
      // 物品自定义分类：未提供 key 时自动生成唯一 key
      if (conf.table === 'item_categories' && !data.key) {
        data.key = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      }
      res.json(insertRow(conf.table, conf.fields, data))
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  api.put(`/${route}/:id`, (req, res) => {
    const row = getOne(conf.table, req.params.id)
    if (!row) return res.status(404).json({ error: '记录不存在' })
    res.json(updateRow(conf.table, conf.fields, req.params.id, pick(req.body, conf.fields)))
  })

  api.delete(`/${route}/:id`, (req, res) => {
    // 删除物品分类时，可将该分类下的物品迁移到另一分类（?moveTo=<key>）
    if (conf.table === 'item_categories') {
      const row = getOne('item_categories', req.params.id)
      const moveTo = String(req.query.moveTo || '')
      if (row && moveTo) db.prepare('UPDATE items SET category = ? WHERE category = ?').run(moveTo, row.key)
    }
    deleteRow(conf.table, req.params.id)
    res.json({ ok: true })
  })
}

// ---------- 设置 ----------
api.get('/settings', (_req, res) => res.json(db.prepare('SELECT * FROM settings WHERE id = 1').get()))
api.put('/settings', (req, res) => {
  const data = pick(req.body, ['groom_name', 'bride_name', 'wedding_date', 'venue', 'total_budget'])
  updateRow('settings', ['groom_name', 'bride_name', 'wedding_date', 'venue', 'total_budget'], 1, data)
  res.json(db.prepare('SELECT * FROM settings WHERE id = 1').get())
})

// ---------- 仪表盘聚合 ----------
api.get('/summary', (_req, res) => {
  const cats = listAll('budget_categories')
  const expenses = listAll('expenses', 'id DESC')
  const items = listAll('items')

  const catSpent = {}
  for (const c of cats) catSpent[c.id] = 0
  for (const e of expenses) if (e.category_id in catSpent) catSpent[e.category_id] += e.amount || 0
  for (const it of items) {
    if (it.purchased && it.actual_price && it.budget_category_id in catSpent) {
      catSpent[it.budget_category_id] += it.actual_price
    }
  }

  const totalSpent = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    + items.filter(i => i.purchased).reduce((s, i) => s + (i.actual_price || 0), 0)

  const tasks = listAll('tasks')
  const guests = listAll('guests', 'id')
  const decorations = listAll('decorations')

  const rsvpCount = { pending: 0, yes: 0, no: 0 }
  let confirmedHeads = 0, invitedHeads = 0, giftTotal = 0
  for (const g of guests) {
    rsvpCount[g.rsvp] = (rsvpCount[g.rsvp] || 0) + 1
    const n = Number(g.count) || 1
    invitedHeads += n
    if (g.rsvp === 'yes') confirmedHeads += n
    giftTotal += Number(g.gift) || 0
  }

  res.json({
    budget: {
      totalBudget: db.prepare('SELECT total_budget FROM settings WHERE id=1').get().total_budget || 0,
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
      actualTotal: items.filter(i => i.purchased).reduce((s, i) => s + (i.actual_price || 0), 0)
    },
    guests: { total: guests.length, ...rsvpCount, confirmedHeads, invitedHeads, giftTotal },
    decorations: { total: decorations.length, done: decorations.filter(d => d.done).length },
    upcoming: tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1)
      .slice(0, 5)
  })
})

// ---------- 备份 / 恢复 ----------
const ALL_TABLES = ['settings', ...Object.values(SCHEMA).map(c => c.table)]

api.get('/backup', (_req, res) => {
  const data = { app: 'wedding-plan', version: 1, exportedAt: new Date().toISOString() }
  for (const t of ALL_TABLES) data[t] = db.prepare(`SELECT * FROM ${t}`).all()
  res.setHeader('Content-Disposition', `attachment; filename="wedding-backup-${Date.now()}.json"`)
  res.json(data)
})

api.post('/backup', (req, res) => {
  const data = req.body
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '无效的备份文件' })
  for (const t of Object.values(SCHEMA).map(c => c.table)) {
    if (!Array.isArray(data[t])) return res.status(400).json({ error: `备份缺少 ${t} 数据` })
  }
  db.exec('BEGIN')
  try {
    clearData()
    const s = data.settings?.[0]
    if (s) db.prepare('UPDATE settings SET groom_name=?, bride_name=?, wedding_date=?, venue=?, total_budget=? WHERE id=1')
      .run(s.groom_name || '', s.bride_name || '', s.wedding_date || '', s.venue || '', s.total_budget || 0)
    for (const [route, conf] of Object.entries(SCHEMA)) {
      for (const row of data[conf.table]) insertRow(conf.table, conf.fields, pick(row, conf.fields))
    }
    db.exec('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    db.exec('ROLLBACK')
    res.status(400).json({ error: e.message })
  }
})

// ---------- 模板 ----------
api.post('/seed/reset', (_req, res) => { seedTemplate(); res.json({ ok: true }) })
api.post('/seed/clear', (_req, res) => { clearData(); res.json({ ok: true }) })
api.post('/timeline/template', (_req, res) => { seedTimeline(); res.json({ ok: true }) })

app.use('/api', api)
app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }))

// ---------- 生产模式：托管前端构建产物 ----------
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

// 默认使用本项目的专用端口 19002（已确认与同机其他服务不冲突），监听 0.0.0.0 以便局域网访问；
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

if (isEmpty()) {
  seedTemplate()
  console.log('首次启动：已载入备婚模板数据')
}
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
