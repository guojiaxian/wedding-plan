import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// 数据库文件路径：默认项目内 server/data/wedding.db，可用 DB_PATH 环境变量覆盖（线上/线下数据隔离）
const dbFile = process.env.DB_PATH || path.join(dataDir, 'wedding.db')
export const db = new DatabaseSync(dbFile)
db.exec('PRAGMA journal_mode = WAL;')

// ---------- 建表 ----------
db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  groom_name TEXT DEFAULT '',
  bride_name TEXT DEFAULT '',
  wedding_date TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  total_budget REAL DEFAULT 0
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  budget REAL DEFAULT 0,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  name TEXT NOT NULL,
  amount REAL DEFAULT 0,
  date TEXT DEFAULT '',
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL,
  budget_category_id INTEGER,
  estimated_price REAL DEFAULT 0,
  actual_price REAL,
  purchased INTEGER DEFAULT 0,
  channel TEXT DEFAULT '',
  note TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  phase TEXT DEFAULT 'm6',
  due_date TEXT DEFAULT '',
  status TEXT DEFAULT 'todo',
  assignee TEXT DEFAULT '',
  note TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT DEFAULT '',
  title TEXT NOT NULL,
  duration TEXT DEFAULT '',
  location TEXT DEFAULT '',
  owner TEXT DEFAULT '',
  note TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  role TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  duty TEXT DEFAULT '',
  event_title TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  side TEXT DEFAULT 'common',
  grp TEXT DEFAULT '',
  relationship TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  rsvp TEXT DEFAULT 'pending',
  count INTEGER DEFAULT 1,
  table_no TEXT DEFAULT '',
  gift REAL,
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📦',
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS decorations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT DEFAULT 'ceremony',
  name TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  source TEXT DEFAULT '',
  note TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);
`)

// ---------- 通用 CRUD 辅助（表名/字段均为白名单，参数化查询） ----------
export function listAll(table, orderBy = 'sort, id') {
  return db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all()
}
export function getOne(table, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
}
export function pick(body, fields) {
  const out = {}
  for (const f of fields) if (body && f in body) out[f] = body[f]
  return out
}
export function insertRow(table, fields, data) {
  const keys = Object.keys(data)
  if (!keys.length) throw new Error('没有可写入的字段')
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
  const info = db.prepare(sql).run(...keys.map(k => data[k] ?? null))
  return getOne(table, Number(info.lastInsertRowid))
}
export function updateRow(table, fields, id, data) {
  const keys = Object.keys(data).filter(k => fields.includes(k))
  if (!keys.length) return getOne(table, id)
  const sql = `UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`
  db.prepare(sql).run(...keys.map(k => data[k] ?? null), id)
  return getOne(table, id)
}
export function deleteRow(table, id) {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
}
export function clearData() {
  const tables = ['budget_categories', 'expenses', 'items', 'item_categories', 'tasks', 'timeline_events', 'staff', 'guests', 'decorations']
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run()
}

// ---------- 模板数据 ----------
const TZ = process.env.TZ || 'Asia/Shanghai'
const _fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }) // sv-SE → YYYY-MM-DD
export function localDate(d = new Date()) {
  return _fmt.format(d)
}
function daysLater(n) {
  return localDate(new Date(Date.now() + n * 86400000))
}

export const TIMELINE_TEMPLATE = [
  ['06:30', '新娘化妆造型', '2小时', '新娘房', '化妆师', '新郎同步整理着装'],
  ['08:00', '新郎车队出发接亲', '30分钟', '新郎家 → 新娘家', '伴郎团', '携带接亲红包'],
  ['08:30', '堵门游戏 · 找婚鞋', '30分钟', '新娘家', '伴郎伴娘团', '适度就好，别误吉时'],
  ['09:00', '敬茶改口 · 吃汤圆', '30分钟', '新娘家客厅', '双方父母', '茶具提前备好热水'],
  ['09:30', '出门赴酒店', '40分钟', '车队', '车队总管', '提前踩点路线'],
  ['10:30', '新人到场休息补妆', '40分钟', '酒店贵宾房', '伴娘', '新娘换主婚纱'],
  ['11:18', '宾客入席 · 开场暖场', '10分钟', '宴会厅', '司仪', '迎宾组引导签到'],
  ['11:28', '证婚仪式', '15分钟', '主舞台', '司仪/证婚人', '交换戒指 · 宣读誓词'],
  ['11:43', '双方父母致辞 · 敬茶', '15分钟', '主舞台', '双方父母', ''],
  ['11:58', '开席 · 新人敬酒', '90分钟', '宴会厅', '双方', '按桌次敬酒'],
  ['13:30', '送客 · 发放伴手礼', '30分钟', '宴会厅门口', '迎宾组', '']
]

export function seedTimeline() {
  db.prepare('DELETE FROM timeline_events').run()
  const ev = db.prepare('INSERT INTO timeline_events (time, title, duration, location, owner, note, sort) VALUES (?,?,?,?,?,?,?)')
  TIMELINE_TEMPLATE.forEach((r, i) => ev.run(...r, i))
}

export function seedTemplate() {
  clearData()
  db.prepare(`UPDATE settings SET groom_name=?, bride_name=?, wedding_date=?, venue=?, total_budget=? WHERE id=1`)
    .run('阿伟', '小雅', daysLater(128), '幸福大酒店 · 宴会厅', 130000)

  const cat = db.prepare('INSERT INTO budget_categories (name, budget, sort) VALUES (?,?,?)')
  const catId = {}
  ;[
    ['婚宴酒席', 60000], ['婚纱摄影', 8000], ['婚戒首饰', 15000], ['礼服造型', 6000],
    ['婚礼策划布置', 12000], ['婚车车队', 3000], ['喜糖喜品', 3000], ['司仪摄像', 8000],
    ['蜜月旅行', 10000], ['备用金', 5000]
  ].forEach(([name, budget], i) => { catId[name] = Number(cat.run(name, budget, i).lastInsertRowid) })

  const icat = db.prepare('INSERT INTO item_categories (key, name, icon, sort) VALUES (?,?,?,?)')
  ;[
    ['bride', '新娘', '👗'], ['groom', '新郎', '🤵'], ['ceremony', '仪式用品', '💍'],
    ['favor', '喜品伴手礼', '🎁'], ['other', '其他', '📦']
  ].forEach(([key, name, icon], i) => icat.run(key, name, icon, i))

  const it = db.prepare('INSERT INTO items (category, name, budget_category_id, estimated_price, actual_price, purchased, channel, note, sort) VALUES (?,?,?,?,?,?,?,?,?)')
  ;[
    ['bride', '主婚纱（租赁）', catId['礼服造型'], 3000, null, 0, '', '含头纱，试纱后定款', 0],
    ['bride', '敬酒服', catId['礼服造型'], 800, null, 0, '', '红色，方便走动', 1],
    ['bride', '婚鞋', catId['礼服造型'], 500, 459, 1, '天猫', '3cm 粗跟，备一双平底', 2],
    ['bride', '头饰头纱', catId['礼服造型'], 300, null, 0, '', '', 3],
    ['bride', '隐形内衣', 0, 100, null, 0, '', '', 4],
    ['bride', '伴娘服（4套）', catId['礼服造型'], 1200, null, 0, '', '香槟色统一款', 5],
    ['groom', '西装', catId['礼服造型'], 2500, null, 0, '', '藏青色', 0],
    ['groom', '衬衫领结', 0, 400, null, 0, '', '', 1],
    ['groom', '皮鞋', 0, 600, null, 0, '', '', 2],
    ['groom', '袖扣', catId['婚戒首饰'], 150, 128, 1, '京东', '', 3],
    ['ceremony', '对戒', catId['婚戒首饰'], 12000, null, 0, '', '婚前 3 个月定制', 0],
    ['ceremony', '敬茶茶具', 0, 200, null, 0, '', '红色对杯+茶盘', 1],
    ['ceremony', '改口红包', 0, 1000, null, 0, '', '双方父母各一', 2],
    ['ceremony', '喜字贴纸', catId['婚礼策划布置'], 80, 75, 1, '拼多多', '大门/房门/楼梯', 3],
    ['ceremony', '堵门游戏道具', 0, 100, null, 0, '', '伴娘准备', 4],
    ['ceremony', '婚礼誓词本', 0, 30, null, 0, '', '', 5],
    ['favor', '喜糖盒', catId['喜糖喜品'], 400, null, 0, '', '按 200 份备', 0],
    ['favor', '伴手礼', catId['喜糖喜品'], 1000, null, 0, '', '远道亲友', 1],
    ['favor', '烟酒糖备货', catId['婚宴酒席'], 1500, null, 0, '', '按桌数×1.2', 2],
    ['favor', '请柬', 0, 300, null, 0, '', '电子+纸质', 3],
    ['favor', '签到本签名笔', 0, 100, null, 0, '', '', 4],
    ['other', '新娘应急包', 0, 100, null, 0, '', '针线/创可贴/备用丝袜/吸管', 0],
    ['other', '备用雨伞', 0, 60, null, 0, '', '', 1],
    ['other', '充电宝', 0, 100, null, 0, '', '手机全天高耗电', 2]
  ].forEach(r => it.run(...r))

  const tk = db.prepare('INSERT INTO tasks (title, phase, due_date, status, assignee, note, sort) VALUES (?,?,?,?,?,?,?)')
  ;[
    ['确定婚期与总预算', 'm12', daysLater(-200), 'done', '双方', '已与双方父母商定', 0],
    ['双方父母见面', 'm12', daysLater(-190), 'done', '双方', '', 1],
    ['预定婚宴场地', 'm12', daysLater(-150), 'done', '夫妻', '幸福大酒店已交定金', 2],
    ['预定婚庆策划与四大金刚', 'm9', daysLater(-90), 'doing', '小雅', '司仪/摄影/摄像/化妆', 0],
    ['拍婚纱照', 'm9', daysLater(-60), 'todo', '夫妻', '选 3 家对比', 1],
    ['领证（选好日子）', 'm6', daysLater(-30), 'done', '夫妻', '', 0],
    ['购买对戒', 'm6', daysLater(20), 'todo', '夫妻', '预算 1.2w', 1],
    ['确定宾客名单初稿', 'm6', daysLater(30), 'todo', '双方父母', '', 2],
    ['确定婚纱礼服', 'm3', daysLater(45), 'todo', '小雅', '', 0],
    ['预定婚车车队', 'm3', daysLater(50), 'todo', '阿伟', '头车+5 辆副车', 1],
    ['发送电子请柬', 'm3', daysLater(60), 'todo', '夫妻', '', 2],
    ['蜜月旅行计划', 'm3', daysLater(80), 'todo', '夫妻', '三亚 or 云南', 3],
    ['采购喜糖喜品', 'm1', daysLater(95), 'todo', '小雅', '对照物品清单', 0],
    ['试妆试纱', 'm1', daysLater(100), 'todo', '小雅', '', 1],
    ['酒店试菜', 'm1', daysLater(105), 'todo', '双方父母', '', 2],
    ['确认婚礼当天流程', 'm1', daysLater(110), 'todo', '夫妻', '与司仪对接', 3],
    ['与婚庆最终对接', 'w1', daysLater(122), 'todo', '夫妻', '布置图+时间表', 0],
    ['打包婚礼当日物品', 'w1', daysLater(124), 'todo', '伴娘', '应急包/敬茶具/红包', 1],
    ['人员分工最终确认', 'w1', daysLater(125), 'todo', '阿伟', '发到群里', 2],
    ['准备各类红包', 'w1', daysLater(126), 'todo', '妈妈', '改口/堵门/司机/工作人员', 3]
  ].forEach(r => tk.run(...r))

  const ev = db.prepare('INSERT INTO timeline_events (time, title, duration, location, owner, note, sort) VALUES (?,?,?,?,?,?,?)')
  TIMELINE_TEMPLATE.forEach((r, i) => ev.run(...r, i))

  const st = db.prepare('INSERT INTO staff (name, role, phone, duty, event_title) VALUES (?,?,?,?,?)')
  ;[
    ['', '婚礼总管（统筹）', '', '全场统筹协调，处理突发情况', ''],
    ['', '伴郎（2 名）', '', '陪同新郎，保管戒指，带头堵门', '堵门游戏 · 找婚鞋'],
    ['', '伴娘（2 名）', '', '陪同新娘，保管婚包与应急包', '新娘化妆造型'],
    ['', '迎宾签到（2 名）', '', '迎接宾客，引导入座签到', '宾客入席 · 开场暖场'],
    ['', '收礼金记账（2 名）', '', '礼金登记与保管，双人核对', ''],
    ['', '物品保管', '', '烟酒/喜糖/婚纱物品看管', ''],
    ['', '车队总管', '', '车辆调度与路线指引', '新郎车队出发接亲'],
    ['', '酒店对接', '', '协调上菜节奏/音响/大屏播放', '开席 · 新人敬酒']
  ].forEach(r => st.run(...r))

  const gu = db.prepare('INSERT INTO guests (name, side, grp, relationship, phone, rsvp, count, table_no, gift, note) VALUES (?,?,?,?,?,?,?,?,?,?)')
  ;[
    ['大伯一家', 'groom', '家人', '伯父', '138xxxx0001', 'yes', 4, '左1', null, '需要接站'],
    ['姑姑', 'groom', '家人', '姑姑', '138xxxx0002', 'yes', 3, '左1', null, '对海鲜过敏'],
    ['大学室友老王', 'groom', '同学', '室友', '138xxxx0003', 'yes', 1, '右1', null, '可能带对象'],
    ['表姨一家', 'bride', '亲戚', '表姨', '139xxxx0001', 'pending', 3, '左2', null, ''],
    ['闺蜜乐乐', 'bride', '朋友', '闺蜜', '139xxxx0002', 'yes', 1, '右2', null, '兼伴娘'],
    ['张阿姨一家', 'bride', '亲戚', '邻居', '139xxxx0003', 'no', 3, '', null, '回老家了，随礼']
  ].forEach(r => gu.run(...r))

  const de = db.prepare('INSERT INTO decorations (area, name, done, source, note, sort) VALUES (?,?,?,?,?,?)')
  ;[
    ['sign', '签到台 + 桌布花艺', 0, '婚庆', '', 0],
    ['sign', '迎宾牌 / 照片展示架', 0, '婚庆', '用旅拍照片', 1],
    ['sign', '签到本 + 签名笔', 0, '自制', '', 2],
    ['sign', '伴手礼摆放区', 0, '自制', '', 3],
    ['ceremony', '主背景 + 花艺', 0, '婚庆', '', 0],
    ['ceremony', '花门 / 拱门', 0, '婚庆', '', 1],
    ['ceremony', '红毯 + 路引', 0, '婚庆', '', 2],
    ['ceremony', '音响 / 无线麦克风 ×2', 0, '婚庆', '仪式前试音', 3],
    ['banquet', '桌花', 0, '婚庆', '', 0],
    ['banquet', '椅背纱 / 椅背花', 0, '婚庆', '', 1],
    ['banquet', '大屏背景 + 婚前视频', 0, '婚庆', '视频需提前一周剪辑', 2],
    ['banquet', '舞台灯光', 0, '婚庆', '', 3],
    ['banquet', '烟酒糖摆台', 0, '自制', '每桌按标准摆放', 4],
    ['photo', '拍照背景板', 0, '租赁', '', 0],
    ['photo', '拍照道具（相框/灯牌）', 0, '自制', '', 1],
    ['photo', '气球布置', 0, '自制', '', 2],
    ['home', '婚房气球 + 喜字', 0, '自制', '婚前一晚布置', 0],
    ['home', '红色床品四件套', 0, '自制', '', 1],
    ['home', '压床娃娃', 0, '自制', '', 2]
  ].forEach(r => de.run(...r))

  markSeeded()
}

export function isEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM items').get()
  return Number(row.n) === 0
}

// 首次初始化标记：只存于 meta 表，不随 clearData/备份清除。
// 防止用户「清空数据」后服务重启时模板数据被重新写入（数据复活缺陷）。
export function isSeeded() {
  return !!db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get()
}
export function markSeeded() {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', '1')").run()
}
