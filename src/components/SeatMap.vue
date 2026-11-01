<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, toast } from '../api/client'
import type { Guest } from '../api/types'
import UiModal from './UiModal.vue'
import EmptyState from './EmptyState.vue'

// 布局：前方舞台，中间过道，两侧各 10 桌
const TABLES_PER_SIDE = 10
const leftTables = Array.from({ length: TABLES_PER_SIDE }, (_, i) => `左${i + 1}`)
const rightTables = Array.from({ length: TABLES_PER_SIDE }, (_, i) => `右${i + 1}`)
const allTableIds = [...leftTables, ...rightTables]

const guests = ref<Guest[]>([])
const loading = ref(true)
const capacity = ref(Number(localStorage.getItem('wedding-table-capacity')) || 10)
const activeTable = ref('')
const keyword = ref('')

async function load() {
  try { guests.value = await api.get<Guest[]>('/guests') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const atTable = (tid: string) => guests.value.filter(g => g.table_no === tid)
const seatSum = (tid: string) => atTable(tid).reduce((s, g) => s + (Number(g.count) || 1), 0)

const totalAssigned = computed(() => allTableIds.reduce((s, t) => s + seatSum(t), 0))
const confirmedHeads = computed(() => guests.value.filter(g => g.rsvp === 'yes').reduce((s, g) => s + (Number(g.count) || 1), 0))
const unassignedConfirmed = computed(() =>
  guests.value.filter(g => g.rsvp === 'yes' && !allTableIds.includes(g.table_no)).reduce((s, g) => s + (Number(g.count) || 1), 0)
)

function setCapacity(n: number) {
  capacity.value = n
  localStorage.setItem('wedding-table-capacity', String(n))
}

// ===== 桌位弹窗 =====
const tableGuests = computed(() => (activeTable.value ? atTable(activeTable.value) : []))
const candidates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return guests.value
    .filter(g => g.table_no !== activeTable.value)
    .filter(g => !kw || [g.name, g.relationship, g.grp].some(v => (v || '').toLowerCase().includes(kw)))
})
const sideText = (g: Guest) => (g.side === 'groom' ? '男方' : g.side === 'bride' ? '女方' : '共同')
const rsvpBadge = (g: Guest) => (g.rsvp === 'yes' ? 'ok' : g.rsvp === 'no' ? 'mute' : 'warn')
const rsvpText = (g: Guest) => (g.rsvp === 'yes' ? '确认' : g.rsvp === 'no' ? '婉拒' : '待复')

// 圆桌围坐宾客圆点：沿内环均匀分布
function dotStyle(i: number, total: number) {
  const angle = (i / total) * 360 - 90
  return { transform: `rotate(${angle}deg) translate(var(--seat-r, 34px)) rotate(${-angle}deg)` }
}

async function seatGuest(g: Guest) {
  if (!activeTable.value) return
  try {
    await api.put(`/guests/${g.id}`, { table_no: activeTable.value })
    toast(`「${g.name}」已入座 ${activeTable.value}`)
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function unseatGuest(g: Guest) {
  try {
    await api.put(`/guests/${g.id}`, { table_no: '' })
    toast(`「${g.name}」已移出 ${activeTable.value}`)
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <!-- 统计与容量 -->
    <div class="card stat-line">
      <span>已安排 <b class="num pink">{{ totalAssigned }}</b> 人</span>
      <span>确认出席 <b class="num">{{ confirmedHeads }}</b> 人</span>
      <span v-if="unassignedConfirmed" class="warn-text">⚠️ {{ unassignedConfirmed }} 位确认宾客未安排桌位</span>
      <span class="cap">
        每桌
        <select class="select cap-select" :value="capacity" @change="setCapacity(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="n in [6, 8, 10, 12]" :key="n" :value="n">{{ n }} 人</option>
        </select>
      </span>
    </div>

    <div class="mt16" v-if="!loading && !guests.length">
      <EmptyState emoji="🪑" text="还没有宾客名单，先去添加宾客吧">
        <router-link to="/guests" class="btn btn-primary">去宾客名单</router-link>
      </EmptyState>
    </div>

    <!-- 桌位图：圆桌交错排列 -->
    <div class="floor card mt16" v-else>
      <div class="stage">🎀 舞 台 🎀</div>
      <div class="aisle-label"><span>中 央 过 道</span></div>
      <div class="floor-grid">
        <div class="side-col">
          <div v-for="t in leftTables" :key="t" class="table-card" :class="{ over: seatSum(t) > capacity }" :title="atTable(t).map(g => `${g.name}×${g.count || 1}`).join('、') || '空桌'" @click="activeTable = t">
            <div class="table-circle">
              <span v-for="i in Math.min(seatSum(t), 16)" :key="i" class="seat-dot" :style="dotStyle(i, Math.min(seatSum(t), 16))"></span>
              <span class="t-no">{{ t }}</span>
              <span class="t-seats num" :class="{ 'over-num': seatSum(t) > capacity }">{{ seatSum(t) }}/{{ capacity }}</span>
            </div>
            <div class="t-names" v-if="atTable(t).length">{{ atTable(t).map(g => g.name).join('、') }}</div>
          </div>
        </div>
        <div class="aisle">
          <div class="aisle-line"></div>
        </div>
        <div class="side-col">
          <div v-for="t in rightTables" :key="t" class="table-card" :class="{ over: seatSum(t) > capacity }" :title="atTable(t).map(g => `${g.name}×${g.count || 1}`).join('、') || '空桌'" @click="activeTable = t">
            <div class="table-circle">
              <span v-for="i in Math.min(seatSum(t), 16)" :key="i" class="seat-dot" :style="dotStyle(i, Math.min(seatSum(t), 16))"></span>
              <span class="t-no">{{ t }}</span>
              <span class="t-seats num" :class="{ 'over-num': seatSum(t) > capacity }">{{ seatSum(t) }}/{{ capacity }}</span>
            </div>
            <div class="t-names" v-if="atTable(t).length">{{ atTable(t).map(g => g.name).join('、') }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 桌位详情弹窗 -->
    <UiModal :open="!!activeTable" :title="`${activeTable} 桌 · ${seatSum(activeTable)}/${capacity} 人`" @close="activeTable = ''">
      <div class="modal-sec" v-if="tableGuests.length">
        <h4>已入座（点击移出）</h4>
        <div class="list">
          <div v-for="g in tableGuests" :key="g.id" class="row">
            <div class="grow">
              <div class="name">{{ g.name }} <span class="badge mute">{{ sideText(g) }}·{{ g.grp || '未分组' }}</span></div>
              <div class="sub">{{ g.count || 1 }} 人<span v-if="g.relationship"> · {{ g.relationship }}</span></div>
            </div>
            <span class="badge" :class="rsvpBadge(g)">{{ rsvpText(g) }}</span>
            <button class="btn btn-icon btn-danger-ghost" @click="unseatGuest(g)">移出</button>
          </div>
        </div>
      </div>
      <div class="modal-sec" v-else>
        <p class="muted" style="font-size: 13.5px">本桌暂无宾客，从下方名单点击「入座」安排。</p>
      </div>

      <div class="modal-sec">
        <h4>选择宾客入座</h4>
        <input class="input mb8" v-model="keyword" placeholder="🔍 搜索姓名 / 分组 / 关系" />
        <div class="cand-list">
          <div v-for="g in candidates" :key="g.id" class="row cand-row">
            <div class="grow">
              <div class="name">
                {{ g.name }} ×{{ g.count || 1 }}
                <span class="badge mute" style="margin-left: 6px">{{ sideText(g) }}·{{ g.grp || '未分组' }}</span>
                <span v-if="g.table_no" class="badge warn" style="margin-left: 4px">现坐 {{ g.table_no }}</span>
              </div>
            </div>
            <span class="badge" :class="rsvpBadge(g)">{{ rsvpText(g) }}</span>
            <button class="btn btn-icon" @click="seatGuest(g)">入座</button>
          </div>
          <EmptyState v-if="!candidates.length" emoji="🤵" text="没有可安排的宾客" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="activeTable = ''">完成</button>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.stat-line { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; font-size: 13.5px; color: var(--secondary); }
.warn-text { color: var(--warning); font-weight: 600; }
.cap { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.cap-select { width: 90px; padding: 5px 8px; }

.floor { padding: 16px; }
.stage {
  text-align: center; padding: 14px; border-radius: var(--radius);
  background: var(--grad-brand); color: #fff;
  font-weight: 800; letter-spacing: 6px; font-size: 16px;
  box-shadow: var(--shadow);
}
.aisle-label { text-align: center; margin: 8px 0 12px; }
.aisle-label span {
  font-size: 11px; color: var(--muted); letter-spacing: 4px;
  border: 1px dashed var(--line); border-radius: 999px; padding: 3px 14px;
}
.floor-grid {
  display: grid; grid-template-columns: 1fr 46px 1fr; gap: 0 8px;
}
.side-col { display: flex; flex-direction: column; gap: 16px; }
.aisle { display: flex; justify-content: center; }
.aisle-line {
  width: 0; border-left: 2px dashed var(--line); height: 100%; min-height: 200px;
}

/* 圆桌交错排列：奇偶行左右错位 */
.table-card {
  width: 128px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  cursor: pointer;
}
.side-col .table-card:nth-child(odd) { align-self: flex-start; margin-left: 8px; }
.side-col .table-card:nth-child(even) { align-self: flex-end; margin-right: 8px; }

.table-circle {
  --seat-r: 34px;
  position: relative; width: 92px; height: 92px; border-radius: 50%;
  border: 2px solid var(--line); background: var(--card);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0; transition: all .15s; box-shadow: var(--shadow);
}
.table-circle::before {
  content: ''; position: absolute; inset: 7px; border-radius: 50%;
  border: 1px dashed var(--line);
}
.table-card:hover .table-circle {
  border-color: var(--primary); transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(60, 58, 50, 0.14);
}
.table-card.over .table-circle { border-color: var(--danger); }
.table-card.over .table-circle::before { border-color: var(--danger-soft); }
.t-no { font-size: 13.5px; font-weight: 800; line-height: 1.2; }
.t-seats { font-size: 11px; color: var(--muted); font-weight: 700; }
.over-num { color: var(--danger); }

.seat-dot {
  position: absolute; top: 50%; left: 50%;
  width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 2px var(--card);
}
.table-card.over .seat-dot { background: var(--danger); }

.t-names {
  font-size: 11px; color: var(--muted); text-align: center; line-height: 1.35;
  max-width: 128px; overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.modal-sec { margin-bottom: 16px; }
.modal-sec h4 { font-size: 13.5px; margin-bottom: 8px; color: var(--secondary); }
.cand-list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.cand-row { padding: 8px 10px; }

@media (max-width: 640px) {
  .floor { padding: 10px; }
  .stage { font-size: 14px; padding: 11px; letter-spacing: 4px; }
  .floor-grid { grid-template-columns: 1fr 14px 1fr; gap: 0 4px; }
  .side-col { gap: 10px; }
  .side-col .table-card:nth-child(odd) { margin-left: 0; }
  .side-col .table-card:nth-child(even) { margin-right: 0; }
  .table-card { width: 96px; }
  .table-circle { --seat-r: 26px; width: 70px; height: 70px; }
  .table-circle::before { inset: 5px; }
  .t-no { font-size: 11.5px; }
  .t-seats { font-size: 9.5px; }
  .seat-dot { width: 6px; height: 6px; margin: -3px 0 0 -3px; }
  .t-names { font-size: 9.5px; max-width: 96px; }
}
</style>
