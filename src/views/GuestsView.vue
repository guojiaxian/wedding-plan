<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, money, toast } from '../api/client'
import type { Guest } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const SIDES = { groom: '男方', bride: '女方', common: '共同' } as const
const GRPS = ['家人', '亲戚', '同事', '同学', '朋友', '其他']
const RSVP = { pending: '待回复', yes: '确认出席', no: '婉拒' } as const

// 桌位图约定桌号（与现场布置·座位排布一致）：左1-左10 / 右1-右10
const tableIdOptions = [
  ...Array.from({ length: 10 }, (_, i) => `左${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `右${i + 1}`)
]

const guests = ref<Guest[]>([])
const loading = ref(true)
const keyword = ref('')
const sideFilter = ref<'all' | Guest['side']>('all')
const rsvpFilter = ref<'all' | Guest['rsvp']>('all')

async function load() {
  try { guests.value = await api.get<Guest[]>('/guests') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const stats = computed(() => {
  let invited = 0, yes = 0, gift = 0, pending = 0, no = 0
  for (const g of guests.value) {
    const n = Number(g.count) || 1
    invited += n
    if (g.rsvp === 'yes') { yes += n; gift += Number(g.gift) || 0 }
    else if (g.rsvp === 'pending') pending += 1
    else no += 1
  }
  return { total: guests.value.length, invited, yes, pending, no, gift }
})

const filtered = computed(() => guests.value.filter(g => {
  if (sideFilter.value !== 'all' && g.side !== sideFilter.value) return false
  if (rsvpFilter.value !== 'all' && g.rsvp !== rsvpFilter.value) return false
  const kw = keyword.value.trim().toLowerCase()
  if (kw && ![g.name, g.relationship, g.grp, g.phone].some(v => (v || '').toLowerCase().includes(kw))) return false
  return true
}))

const modal = ref(false)
const form = reactive({
  id: 0, name: '', side: 'groom' as Guest['side'], grp: '家人', relationship: '',
  phone: '', rsvp: 'pending' as Guest['rsvp'], count: 1, table_no: '', gift: null as number | null, note: ''
})

function openNew() {
  Object.assign(form, { id: 0, name: '', side: 'groom', grp: '家人', relationship: '', phone: '', rsvp: 'pending', count: 1, table_no: '', gift: null, note: '' })
  modal.value = true
}
function openEdit(g: Guest) {
  Object.assign(form, {
    id: g.id, name: g.name, side: g.side, grp: g.grp || '家人', relationship: g.relationship,
    phone: g.phone, rsvp: g.rsvp, count: g.count, table_no: g.table_no, gift: g.gift, note: g.note
  })
  modal.value = true
}
async function save() {
  if (!form.name.trim()) return toast('请填写宾客姓名', 'err')
  try {
    const body = { ...form, count: Number(form.count) || 1 }
    if (form.id) await api.put(`/guests/${form.id}`, body)
    else await api.post('/guests', body)
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function remove(g: Guest) {
  if (!confirm(`删除宾客「${g.name}」？`)) return
  try {
    await api.del(`/guests/${g.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

function cycleRsvp(g: Guest) {
  const order: Guest['rsvp'][] = ['pending', 'yes', 'no']
  const next = order[(order.indexOf(g.rsvp) + 1) % 3]
  g.rsvp = next
  api.put(`/guests/${g.id}`, { rsvp: next }).then(() => toast(`已标记「${RSVP[next]}」`)).catch((e: any) => { toast(e.message, 'err'); load() })
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">💌</span>宾客名单</h2>
      <button class="btn btn-primary" @click="openNew">＋ 添加宾客</button>
    </div>

    <!-- 统计 -->
    <div class="stat-grid" style="grid-template-columns: repeat(5, 1fr)">
      <div class="stat-card"><div class="label">📨 邀请</div><div class="value num">{{ stats.total }}</div><div class="sub">约 {{ stats.invited }} 人</div></div>
      <div class="stat-card"><div class="label">✅ 确认</div><div class="value num" style="color: var(--success)">{{ stats.yes }}</div><div class="sub">人出席</div></div>
      <div class="stat-card"><div class="label">⏳ 待回复</div><div class="value num" style="color: var(--warning)">{{ stats.pending }}</div><div class="sub">户</div></div>
      <div class="stat-card"><div class="label">🚫 婉拒</div><div class="value num muted">{{ stats.no }}</div><div class="sub">户</div></div>
      <div class="stat-card"><div class="label">🧧 礼金</div><div class="value num gold" style="font-size:17px">¥{{ money(stats.gift) }}</div><div class="sub">已登记</div></div>
    </div>

    <!-- 搜索与筛选 -->
    <div class="card mt16 filter-bar">
      <input class="input search" v-model="keyword" placeholder="🔍 搜索姓名 / 关系 / 电话" />
      <div class="chip-row">
        <button class="chip" :class="{ active: sideFilter === 'all' }" @click="sideFilter = 'all'">全部</button>
        <button v-for="(label, key) in SIDES" :key="key" class="chip" :class="{ active: sideFilter === key }" @click="sideFilter = key">{{ label }}</button>
      </div>
      <div class="chip-row">
        <button class="chip" :class="{ active: rsvpFilter === 'all' }" @click="rsvpFilter = 'all'">全部状态</button>
        <button v-for="(label, key) in RSVP" :key="key" class="chip" :class="{ active: rsvpFilter === key }" @click="rsvpFilter = key">{{ label }}</button>
      </div>
    </div>

    <!-- 列表 -->
    <div class="mt16" v-if="!loading && !filtered.length">
      <EmptyState emoji="💌" :text="guests.length ? '没有符合条件的宾客' : '还没有宾客，开始邀请名单吧'" />
    </div>
    <div class="guest-list" v-else>
      <div v-for="g in filtered" :key="g.id" class="row guest-row" :class="{ declined: g.rsvp === 'no' }">
        <button class="rsvp-pill" :class="g.rsvp" :title="'点击切换出席状态'" @click="cycleRsvp(g)">
          {{ RSVP[g.rsvp] }}
        </button>
        <div class="grow">
          <div class="name">
            {{ g.name }} ×{{ g.count }}
            <span class="badge mute" style="margin-left:6px">{{ SIDES[g.side] }}·{{ g.grp || '未分组' }}</span>
            <span v-if="g.table_no" class="badge warn" style="margin-left:4px">桌 {{ g.table_no }}</span>
          </div>
          <div class="sub">
            <span v-if="g.relationship">{{ g.relationship }}</span>
            <span v-if="g.phone"> · 📞 {{ g.phone }}</span>
            <span v-if="g.rsvp === 'yes' && g.gift != null && g.gift !== ''" class="gold"> · 礼金 ¥{{ money(g.gift) }}</span>
            <span v-if="g.note"> · {{ g.note }}</span>
          </div>
        </div>
        <div class="ops">
          <button class="btn btn-icon" @click="openEdit(g)">✏️</button>
          <button class="btn btn-icon btn-danger-ghost" @click="remove(g)">🗑️</button>
        </div>
      </div>
    </div>

    <UiModal :open="modal" :title="form.id ? '编辑宾客' : '添加宾客'" @close="modal = false">
      <div class="form-grid">
        <div class="field">
          <label>姓名 / 称呼</label>
          <input class="input" v-model="form.name" placeholder="如：大伯一家" @keyup.enter="save" />
        </div>
        <div class="field">
          <label>人数（含本人）</label>
          <input class="input" type="number" min="1" max="20" v-model.number="form.count" />
        </div>
        <div class="field">
          <label>男方 / 女方</label>
          <select class="select" v-model="form.side">
            <option value="groom">男方</option>
            <option value="bride">女方</option>
            <option value="common">共同</option>
          </select>
        </div>
        <div class="field">
          <label>分组</label>
          <select class="select" v-model="form.grp">
            <option v-for="g in GRPS" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>
        <div class="field">
          <label>关系</label>
          <input class="input" v-model="form.relationship" placeholder="如：伯父 / 室友" />
        </div>
        <div class="field">
          <label>电话</label>
          <input class="input" type="tel" v-model="form.phone" />
        </div>
        <div class="field">
          <label>出席状态</label>
          <select class="select" v-model="form.rsvp">
            <option value="pending">待回复</option>
            <option value="yes">确认出席</option>
            <option value="no">婉拒</option>
          </select>
        </div>
        <div class="field">
          <label>桌号</label>
          <input class="input" v-model="form.table_no" list="table-no-options" placeholder="如：左1 / 右10" />
          <datalist id="table-no-options">
            <option v-for="t in tableIdOptions" :key="t" :value="t" />
          </datalist>
        </div>
        <div class="field">
          <label>礼金（元，选填）</label>
          <input class="input" type="number" min="0" v-model.number="form.gift" />
        </div>
        <div class="field full">
          <label>备注</label>
          <input class="input" v-model="form.note" placeholder="如：对海鲜过敏 / 需要接站" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="modal = false">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.filter-bar { display: flex; flex-direction: column; gap: 10px; }
.filter-bar .search { max-width: 360px; }
.guest-list { display: flex; flex-direction: column; gap: 8px; }
.guest-row.declined { opacity: .6; }
.rsvp-pill {
  border: none; border-radius: 999px; padding: 6px 12px; font-size: 12px;
  font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.rsvp-pill.pending { background: var(--warning-soft); color: #B4832F; }
.rsvp-pill.yes { background: var(--success-soft); color: #5A9459; }
.rsvp-pill.no { background: #F3EDF0; color: var(--muted); }
@media (max-width: 767px) {
  .stat-grid[style] { grid-template-columns: repeat(2, 1fr) !important; }
}
</style>
