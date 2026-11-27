<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, money } from '../api/client'
import type {
  Settings, Summary, BudgetCategory, ItemCategory, Item, Task,
  TimelineEvent, Staff, Guest, Decoration
} from '../api/types'

interface ShareData {
  owner: string
  settings: Settings
  summary: Summary
  budgetCategories: BudgetCategory[]
  itemCategories: ItemCategory[]
  items: Item[]
  tasks: Task[]
  timeline: TimelineEvent[]
  staff: Staff[]
  guests: Guest[]
  decorations: Decoration[]
}

const PHASES = [
  { key: 'm12', label: '婚前 12 个月', icon: '🌱' },
  { key: 'm9', label: '婚前 9 个月', icon: '🌿' },
  { key: 'm6', label: '婚前 6 个月', icon: '🍀' },
  { key: 'm3', label: '婚前 3 个月', icon: '🌸' },
  { key: 'm1', label: '婚前 1 个月', icon: '🌺' },
  { key: 'w1', label: '婚礼当周', icon: '💐' }
]
const STATUS: Record<string, string> = { todo: '待办', doing: '进行中', done: '已完成' }
const AREAS = [
  { key: 'welcome', label: '迎宾区', icon: '🙋' },
  { key: 'sign', label: '签到区', icon: '✍️' },
  { key: 'banquet', label: '宴会厅', icon: '🍽️' },
  { key: 'home', label: '婚房', icon: '🏠' }
]
const SIDES = { groom: '男方', bride: '女方', common: '共同' } as const
const RSVP = { pending: '待回复', yes: '确认出席', no: '婉拒' } as const
const TABS = [
  { key: 'overview', label: '总览', icon: '🏠' },
  { key: 'budget', label: '花销', icon: '💰' },
  { key: 'items', label: '物品', icon: '🛍️' },
  { key: 'tasks', label: '任务', icon: '📝' },
  { key: 'timeline', label: '流程', icon: '⏰' },
  { key: 'decorations', label: '布置', icon: '🎀' },
  { key: 'staff', label: '分工', icon: '👥' },
  { key: 'guests', label: '宾客', icon: '💌' }
]

const route = useRoute()
const data = ref<ShareData | null>(null)
const loading = ref(true)
const error = ref('')
const tab = ref('overview')
const preview = ref('')

onMounted(async () => {
  try {
    const token = String(route.params.token || '')
    data.value = await api.get<ShareData>('/share/' + encodeURIComponent(token))
  } catch (e: any) {
    error.value = e.message || '分享链接无效'
  } finally {
    loading.value = false
  }
})

const coupleText = computed(() => {
  const s = data.value?.settings
  if (!s) return ''
  return [s.groom_name, s.bride_name].filter(Boolean).join(' ❤ ') || '备婚计划'
})
const dateText = computed(() => {
  const d = data.value?.settings.wedding_date
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`
})
const countdown = computed(() => {
  const d = data.value?.settings.wedding_date
  if (!d) return null
  const target = new Date(d + 'T00:00:00')
  if (isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
})

const budget = computed(() => data.value?.summary.budget)
// 与花销页口径一致：分类总价合计优先，其次才是设置里的总预算
const plannedTotal = computed(() => (budget.value?.categories || []).reduce((s, c) => s + (Number(c.budget) || 0), 0))
const totalPrice = computed(() => plannedTotal.value || budget.value?.totalBudget || 0)
const budgetPercent = computed(() => pct(budget.value?.totalSpent || 0, totalPrice.value))
const remainBudget = computed(() => Math.max(0, totalPrice.value - (budget.value?.totalSpent || 0)))
const taskStats = computed(() => data.value?.summary.tasks || { total: 0, todo: 0, doing: 0, done: 0 })
const itemStats = computed(() => data.value?.summary.items || { total: 0, purchased: 0, estimatedTotal: 0, actualTotal: 0 })
const guestStats = computed(() => data.value?.summary.guests || { total: 0, pending: 0, yes: 0, no: 0, confirmedHeads: 0, invitedHeads: 0, giftTotal: 0 })
const decoStats = computed(() => data.value?.summary.decorations || { total: 0, done: 0 })
const upcoming = computed(() => data.value?.summary.upcoming || [])

const itemsGrouped = computed(() => {
  const cats = data.value?.itemCategories || []
  const items = data.value?.items || []
  const known = new Set(cats.map(c => c.key))
  const groups = cats.map(c => ({
    key: c.key,
    name: c.name,
    icon: c.icon,
    list: items.filter(i => i.category === c.key)
  }))
  const other = items.filter(i => !known.has(i.category))
  if (other.length) groups.push({ key: '__other', name: '未分类', icon: '📦', list: other })
  return groups.filter(g => g.list.length)
})
const taskGroups = computed(() => PHASES.map(p => ({
  ...p,
  list: (data.value?.tasks || []).filter(t => t.phase === p.key)
})).filter(g => g.list.length))
const decoGroups = computed(() => AREAS.map(a => ({
  ...a,
  list: (data.value?.decorations || []).filter(d => d.area === a.key)
})).filter(g => g.list.length))

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}
function remainText(c: BudgetCategory) {
  const spent = Number(c.spent) || 0
  if (!c.budget) return spent > 0 ? `已付 ¥${money(spent)} · 未设总价` : '未设总价'
  const remain = c.budget - spent
  return remain >= 0 ? `待支付 ¥${money(remain)}` : `已超出 ¥${money(-remain)}`
}
function itemSub(it: Item) {
  const parts: string[] = []
  if (it.purchased) parts.push(`实付 ¥${money(it.actual_price ?? it.estimated_price ?? 0)}`)
  else parts.push(`预计 ¥${money(it.estimated_price || 0)}`)
  if (it.channel) parts.push(it.channel)
  if (it.note) parts.push(it.note)
  return parts.join(' · ')
}
</script>

<template>
  <div class="share-page">
    <div v-if="loading" class="share-state muted">加载中…</div>
    <div v-else-if="error" class="share-state">
      <div class="card error-card">
        <div class="err-emoji">😕</div>
        <div>{{ error }}</div>
        <div class="muted" style="font-size: 12.5px; margin-top: 8px">请向分享人确认链接是否正确</div>
      </div>
    </div>

    <template v-else-if="data">
      <header class="share-head">
        <div class="brand-line"><span>💒 备婚计划</span><span class="ro">只读分享</span></div>
        <h1>{{ coupleText }}</h1>
        <div class="meta" v-if="dateText">📅 {{ dateText }}<template v-if="data.settings.venue"> · 📍 {{ data.settings.venue }}</template></div>
        <div class="meta" v-else-if="data.settings.venue">📍 {{ data.settings.venue }}</div>
        <div class="countdown" v-if="countdown !== null">
          <b>{{ Math.abs(countdown) }}</b>
          <span>{{ countdown >= 0 ? '天后婚礼' : '天前已完婚' }}</span>
        </div>
        <div class="owner muted">由 {{ data.owner }} 分享 · 仅供查看，无法修改</div>
      </header>

      <nav class="share-tabs">
        <button v-for="t in TABS" :key="t.key" class="chip" :class="{ active: tab === t.key }" @click="tab = t.key">
          {{ t.icon }} {{ t.label }}
        </button>
      </nav>

      <!-- 总览 -->
      <template v-if="tab === 'overview'">
        <div class="card">
          <h3 class="section-title" style="margin-top: 0">💰 预算进度</h3>
          <div class="budget-top">
            <div><span class="muted">{{ plannedTotal ? '总价合计' : '总预算' }}</span><div class="num big">¥{{ money(totalPrice) }}</div></div>
            <div><span class="muted">已花费</span><div class="num big pink">¥{{ money(budget?.totalSpent) }}</div></div>
            <div><span class="muted">待支付</span><div class="num big">¥{{ money(remainBudget) }}</div></div>
          </div>
          <div class="progress mt12" v-if="totalPrice"><i :style="{ width: budgetPercent + '%' }"></i></div>
          <div class="muted" style="font-size: 12px; margin-top: 6px" v-if="totalPrice">已使用 {{ budgetPercent }}%</div>
        </div>

        <div class="stat-grid mt16">
          <div class="stat-card"><div class="label">📝 任务完成</div><div class="value num">{{ taskStats.done }}/{{ taskStats.total }}</div><div class="sub">进行中 {{ taskStats.doing }} 项</div></div>
          <div class="stat-card"><div class="label">🛍️ 物品已购</div><div class="value num">{{ itemStats.purchased }}/{{ itemStats.total }}</div><div class="sub">共 {{ itemStats.total }} 件</div></div>
          <div class="stat-card"><div class="label">💌 宾客确认</div><div class="value num">{{ guestStats.confirmedHeads }}/{{ guestStats.invitedHeads }}</div><div class="sub">人出席 · 共 {{ guestStats.total }} 户</div></div>
          <div class="stat-card"><div class="label">🎀 布置就绪</div><div class="value num">{{ decoStats.done }}/{{ decoStats.total }}</div><div class="sub">项</div></div>
        </div>

        <div class="card mt16" v-if="upcoming.length">
          <h3 class="section-title" style="margin-top: 0">⏳ 近期待办</h3>
          <div class="share-line" v-for="t in upcoming" :key="t.id">
            <span class="dot">⬜</span>
            <div class="grow">
              <div class="line-title">{{ t.title }}</div>
              <div class="line-sub">截止 {{ t.due_date || '待定' }}<template v-if="t.assignee"> · {{ t.assignee }}</template></div>
            </div>
          </div>
        </div>
      </template>

      <!-- 花销 -->
      <div class="card" v-else-if="tab === 'budget'">
        <div class="sum-row">
          <span>已付 <b class="pink">¥{{ money(budget?.totalSpent) }}</b></span>
          <span>{{ plannedTotal ? '总价合计' : '总预算' }} <b>¥{{ money(totalPrice) }}</b></span>
          <span>待支付 <b>¥{{ money(remainBudget) }}</b></span>
        </div>
        <div v-for="c in budget?.categories || []" :key="c.id" class="budget-line">
          <div class="bl-head">
            <b>{{ c.name }}</b>
            <span class="num">¥{{ money(c.spent) }} <span class="muted">/ ¥{{ money(c.budget) }}</span></span>
          </div>
          <div class="progress" v-if="c.budget"><i :style="{ width: pct(c.spent || 0, c.budget) + '%' }"></i></div>
          <div class="bl-foot muted">{{ remainText(c) }}</div>
        </div>
        <div v-if="!budget?.categories?.length" class="empty muted">暂无花销项</div>
      </div>

      <!-- 物品 -->
      <template v-else-if="tab === 'items'">
        <div class="card" v-for="g in itemsGrouped" :key="g.key" style="margin-top: 12px">
          <h3 class="section-title" style="margin-top: 0">{{ g.icon }} {{ g.name }} <span class="muted" style="font-weight: 400">（{{ g.list.length }} 件）</span></h3>
          <div class="share-line" v-for="it in g.list" :key="it.id">
            <span class="dot">{{ it.purchased ? '✅' : '⬜' }}</span>
            <div class="grow">
              <div class="line-title" :class="{ done: it.purchased }">{{ it.name }}</div>
              <div class="line-sub">{{ itemSub(it) }}</div>
            </div>
            <span class="badge" :class="it.purchased ? 'ok' : 'mute'">{{ it.purchased ? '已购' : '未购' }}</span>
          </div>
        </div>
        <div class="card" v-if="!itemsGrouped.length"><div class="empty muted">暂无物品</div></div>
      </template>

      <!-- 任务 -->
      <template v-else-if="tab === 'tasks'">
        <div class="card" v-for="p in taskGroups" :key="p.key" style="margin-top: 12px">
          <h3 class="section-title" style="margin-top: 0">{{ p.icon }} {{ p.label }}</h3>
          <div class="share-line" v-for="t in p.list" :key="t.id">
            <span class="dot">{{ t.status === 'done' ? '✅' : t.status === 'doing' ? '🔄' : '⬜' }}</span>
            <div class="grow">
              <div class="line-title" :class="{ done: t.status === 'done' }">{{ t.title }}</div>
              <div class="line-sub">截止 {{ t.due_date || '待定' }}<template v-if="t.assignee"> · {{ t.assignee }}</template><template v-if="t.note"> · {{ t.note }}</template></div>
            </div>
            <span class="badge" :class="t.status === 'done' ? 'ok' : t.status === 'doing' ? 'warn' : 'mute'">{{ STATUS[t.status] }}</span>
          </div>
        </div>
        <div class="card" v-if="!taskGroups.length"><div class="empty muted">暂无任务</div></div>
      </template>

      <!-- 流程 -->
      <div class="card" v-else-if="tab === 'timeline'">
        <div class="tl-line" v-for="e in data.timeline" :key="e.id">
          <div class="tl-time">{{ e.time || '—' }}</div>
          <div class="grow">
            <div class="line-title">{{ e.title }}</div>
            <div class="line-sub">{{ [e.duration, e.location, e.owner].filter(Boolean).join(' · ') }}</div>
            <div class="line-note" v-if="e.note">{{ e.note }}</div>
          </div>
        </div>
        <div v-if="!data.timeline.length" class="empty muted">暂无流程</div>
      </div>

      <!-- 布置 -->
      <template v-else-if="tab === 'decorations'">
        <div class="card" v-for="g in decoGroups" :key="g.key" style="margin-top: 12px">
          <h3 class="section-title" style="margin-top: 0">{{ g.icon }} {{ g.label }} <span class="muted" style="font-weight: 400">（{{ g.list.filter(d => d.done).length }}/{{ g.list.length }} 就绪）</span></h3>
          <div class="share-line" v-for="d in g.list" :key="d.id">
            <span class="dot">{{ d.done ? '✅' : '⬜' }}</span>
            <div class="grow">
              <div class="line-title" :class="{ done: d.done }">{{ d.name }}</div>
              <div class="line-sub">{{ [d.source, d.note].filter(Boolean).join(' · ') || '—' }}</div>
              <div class="thumbs" v-if="d.images?.length">
                <img v-for="im in d.images" :key="im.id" :src="im.thumb" :alt="im.name || d.name" @click="preview = im.thumb" />
              </div>
            </div>
          </div>
        </div>
        <div class="card" v-if="!decoGroups.length"><div class="empty muted">暂无布置项</div></div>
      </template>

      <!-- 分工 -->
      <template v-else-if="tab === 'staff'">
        <div class="staff-grid" v-if="data.staff.length">
          <div class="card staff-card" v-for="s in data.staff" :key="s.id">
            <div class="staff-role">{{ s.role }}</div>
            <div class="staff-name">{{ s.name || '人选待定' }}</div>
            <div class="line-sub" v-if="s.phone">📞 {{ s.phone }}</div>
            <div class="staff-duty" v-if="s.duty">{{ s.duty }}</div>
            <div class="line-sub" v-if="s.event_title">🔗 {{ s.event_title }}</div>
          </div>
        </div>
        <div class="card" v-else><div class="empty muted">暂无分工</div></div>
      </template>

      <!-- 宾客 -->
      <div class="card" v-else-if="tab === 'guests'">
        <div class="sum-row">
          <span>邀请 <b class="num">{{ guestStats.total }}</b> 户 / 约 <b class="num">{{ guestStats.invitedHeads }}</b> 人</span>
          <span>确认 <b class="num" style="color: var(--success)">{{ guestStats.confirmedHeads }}</b> 人</span>
          <span>待回复 <b class="num" style="color: var(--warning)">{{ guestStats.pending }}</b> 户</span>
          <span>礼金 <b class="num gold">¥{{ money(guestStats.giftTotal) }}</b></span>
        </div>
        <div class="guest-row" v-for="g in data.guests" :key="g.id">
          <span class="rsvp" :class="g.rsvp">{{ RSVP[g.rsvp] }}</span>
          <div class="grow">
            <div class="g-name">
              {{ g.name }} ×{{ g.count }}
              <span class="badge mute">{{ SIDES[g.side] }}·{{ g.grp || '未分组' }}</span>
              <span v-if="g.table_no" class="badge warn">桌 {{ g.table_no }}</span>
            </div>
            <div class="g-sub">
              <span v-if="g.relationship">{{ g.relationship }}</span>
              <span v-if="g.phone"> · 📞 {{ g.phone }}</span>
              <span v-if="g.rsvp === 'yes' && g.gift != null && g.gift !== ''" class="gold"> · 礼金 ¥{{ money(g.gift) }}</span>
              <span v-if="g.note"> · {{ g.note }}</span>
            </div>
          </div>
        </div>
        <div v-if="!data.guests.length" class="empty muted">暂无宾客</div>
      </div>

      <footer class="share-foot muted">只读分享 · 数据由「备婚计划」生成</footer>

      <div class="preview" v-if="preview" @click="preview = ''">
        <button class="preview-close" @click.stop="preview = ''">✕</button>
        <img :src="preview" alt="参考图" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.share-page { max-width: 980px; margin: 0 auto; padding: 18px 14px 56px; }
.share-state { min-height: 70vh; display: flex; align-items: center; justify-content: center; }
.error-card { text-align: center; padding: 30px 24px; max-width: 360px; }
.err-emoji { font-size: 34px; margin-bottom: 8px; }
.share-head {
  background: var(--grad-hero); border-radius: var(--radius);
  padding: 24px 20px; box-shadow: var(--shadow);
}
.brand-line { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: var(--secondary); }
.ro {
  margin-left: auto; font-size: 11px; font-weight: 600; color: var(--primary-deep);
  background: #fff; border-radius: 999px; padding: 3px 10px;
}
.share-head h1 { font-size: 22px; font-weight: 800; margin-top: 12px; letter-spacing: .5px; }
.meta { font-size: 13px; color: var(--secondary); margin-top: 6px; line-height: 1.6; }
.countdown { margin-top: 12px; display: flex; align-items: baseline; gap: 6px; }
.countdown b { font-size: 36px; font-family: Georgia, serif; color: var(--primary-deep); line-height: 1; }
.countdown span { font-size: 12.5px; color: var(--secondary); font-weight: 600; }
.owner { font-size: 11.5px; margin-top: 12px; }

.share-tabs {
  display: flex; gap: 8px; overflow-x: auto; padding: 14px 2px 6px;
  position: sticky; top: 0; z-index: 5; background: var(--bg);
}
.share-tabs .chip { flex-shrink: 0; }

.budget-top { display: flex; gap: 22px; flex-wrap: wrap; }
.budget-top > div { min-width: 92px; }
.big { font-size: 20px; font-weight: 800; margin-top: 2px; }
.mt12 { margin-top: 12px; }

.sum-row { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13.5px; color: var(--secondary); }
.budget-line { padding: 12px 0; border-top: 1px dashed var(--line); margin-top: 8px; }
.bl-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 13.5px; }
.bl-head .num { white-space: nowrap; }
.bl-head + .progress { margin-top: 8px; }
.bl-foot { font-size: 12px; margin-top: 6px; }

.share-line {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 0; border-bottom: 1px dashed var(--line);
}
.share-line:last-child { border-bottom: none; padding-bottom: 2px; }
.dot { flex-shrink: 0; font-size: 14px; line-height: 1.5; }
.line-title { font-size: 14px; font-weight: 600; }
.line-title.done { color: var(--muted); text-decoration: line-through; }
.line-sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; line-height: 1.6; }
.line-note { font-size: 12px; color: var(--secondary); margin-top: 4px; line-height: 1.6; }

.tl-line { display: flex; gap: 12px; padding: 11px 0; border-bottom: 1px dashed var(--line); }
.tl-line:last-child { border-bottom: none; padding-bottom: 2px; }
.tl-time { flex-shrink: 0; min-width: 46px; font-size: 12.5px; font-weight: 700; color: var(--accent-deep); }

.thumbs { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.thumbs img {
  width: 64px; height: 64px; object-fit: cover; border-radius: 8px;
  border: 1px solid var(--line); cursor: zoom-in;
}

.staff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.staff-card { padding: 14px 16px; }
.staff-role { font-size: 14.5px; font-weight: 700; }
.staff-name { font-size: 13px; color: var(--accent-deep); font-weight: 600; margin-top: 2px; }
.staff-duty { font-size: 12.5px; color: var(--secondary); margin-top: 8px; line-height: 1.6; }
.staff-card .line-sub { margin-top: 6px; }

.guest-row { display: flex; align-items: flex-start; gap: 10px; padding: 11px 0; border-bottom: 1px dashed var(--line); }
.guest-row:last-child { border-bottom: none; padding-bottom: 2px; }
.rsvp { flex-shrink: 0; font-size: 11.5px; font-weight: 700; border-radius: 999px; padding: 4px 9px; white-space: nowrap; }
.rsvp.yes { background: var(--success-soft); color: #5A9459; }
.rsvp.pending { background: var(--warning-soft); color: #B4832F; }
.rsvp.no { background: #F3EDF0; color: var(--muted); }
.g-name { font-size: 14px; font-weight: 600; line-height: 1.6; }
.g-sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; line-height: 1.6; }

.empty { text-align: center; padding: 18px; font-size: 13px; }
.share-foot { text-align: center; font-size: 11.5px; margin-top: 24px; }

.preview {
  position: fixed; inset: 0; z-index: 200; background: rgba(32, 30, 27, .88);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.preview img { max-width: 100%; max-height: 85vh; border-radius: 10px; }
.preview-close {
  position: absolute; top: 16px; right: 16px; width: 34px; height: 34px;
  border: none; border-radius: 50%; background: rgba(255, 255, 255, .2);
  color: #fff; font-size: 15px; cursor: pointer;
}
</style>
