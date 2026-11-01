<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, toast } from '../api/client'
import type { Decoration } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'
import SeatMap from '../components/SeatMap.vue'

const tab = ref<'list' | 'seats'>('list')

const AREAS = [
  { key: 'sign', label: '签到区', icon: '✍️' },
  { key: 'ceremony', label: '仪式区', icon: '💐' },
  { key: 'banquet', label: '宴会厅', icon: '🍽️' },
  { key: 'photo', label: '拍照区', icon: '📷' },
  { key: 'home', label: '婚房', icon: '🏠' }
]

const decorations = ref<Decoration[]>([])
const loading = ref(true)
const collapsed = ref<Record<string, boolean>>({})

async function load() {
  try { decorations.value = await api.get<Decoration[]>('/decorations') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const grouped = computed(() => AREAS.map(a => ({
  ...a,
  list: decorations.value.filter(d => d.area === a.key)
})).filter(g => g.list.length))

const stats = computed(() => ({
  total: decorations.value.length,
  done: decorations.value.filter(d => d.done).length
}))
const areaDone = (key: string) => decorations.value.filter(d => d.area === key && d.done).length
const areaTotal = (key: string) => decorations.value.filter(d => d.area === key).length

async function toggle(d: Decoration) {
  try {
    d.done = d.done ? 0 : 1
    await api.put(`/decorations/${d.id}`, { done: d.done })
  } catch (e: any) { toast(e.message, 'err'); load() }
}

const modal = ref(false)
const form = reactive({ id: 0, area: 'ceremony', name: '', done: false, source: '', note: '' })

function openNew(area: string) {
  Object.assign(form, { id: 0, area, name: '', done: false, source: '', note: '' })
  modal.value = true
}
function openEdit(d: Decoration) {
  Object.assign(form, { id: d.id, area: d.area, name: d.name, done: !!d.done, source: d.source, note: d.note })
  modal.value = true
}
async function save() {
  if (!form.name.trim()) return toast('请填写布置项', 'err')
  try {
    const body = { area: form.area, name: form.name, done: form.done ? 1 : 0, source: form.source, note: form.note }
    if (form.id) await api.put(`/decorations/${form.id}`, body)
    else await api.post('/decorations', body)
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function remove(d: Decoration) {
  if (!confirm(`删除布置项「${d.name}」？`)) return
  try {
    await api.del(`/decorations/${d.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">🎀</span>现场布置</h2>
      <div class="page-actions">
        <button class="btn" @click="openNew('ceremony')">＋ 添加布置项</button>
      </div>
    </div>

    <div class="chip-row mb16">
      <button class="chip" :class="{ active: tab === 'list' }" @click="tab = 'list'">🎀 布置清单</button>
      <button class="chip" :class="{ active: tab === 'seats' }" @click="tab = 'seats'">🪑 座位排布</button>
    </div>

    <template v-if="tab === 'list'">
    <div class="card stat-line">
      <span>共 <b class="num">{{ stats.total }}</b> 项</span>
      <span>已就绪 <b class="num" style="color: var(--success)">{{ stats.done }}</b> 项</span>
      <span class="progress" style="flex:1; min-width: 120px" v-if="stats.total">
        <i :style="{ width: Math.round(stats.done / stats.total * 100) + '%' }" />
      </span>
    </div>

    <div v-if="!loading && !grouped.length" class="mt16">
      <EmptyState emoji="🎀" text="还没有布置清单，从签到区或仪式区开始规划吧" />
    </div>

    <div v-for="g in grouped" :key="g.key" class="card group-card">
      <div class="group-head" @click="collapsed[g.key] = !collapsed[g.key]">
        <span class="gi">{{ g.icon }} <b>{{ g.label }}</b></span>
        <span class="muted gs">{{ areaDone(g.key) }}/{{ areaTotal(g.key) }} 就绪</span>
        <span class="arrow" :class="{ up: !collapsed[g.key] }">▾</span>
      </div>
      <div class="list" v-show="!collapsed[g.key]">
        <div v-for="d in g.list" :key="d.id" class="row" :class="{ done: d.done }">
          <input type="checkbox" class="ck" :checked="!!d.done" @change="toggle(d)" />
          <div class="grow">
            <div class="name">
              {{ d.name }}
              <span v-if="d.source" class="badge warn" style="margin-left:6px">{{ d.source }}</span>
            </div>
            <div class="sub" v-if="d.note">{{ d.note }}</div>
          </div>
          <div class="ops">
            <button class="btn btn-icon" @click="openEdit(d)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="remove(d)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    </template>

    <SeatMap v-else />

    <UiModal :open="modal" :title="form.id ? '编辑布置项' : '添加布置项'" @close="modal = false">
      <div class="form-grid">
        <div class="field full">
          <label>布置项</label>
          <input class="input" v-model="form.name" placeholder="如：主背景 + 花艺" @keyup.enter="save" />
        </div>
        <div class="field">
          <label>所属区域</label>
          <select class="select" v-model="form.area">
            <option v-for="a in AREAS" :key="a.key" :value="a.key">{{ a.icon }} {{ a.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>来源</label>
          <select class="select" v-model="form.source">
            <option value="">未定</option>
            <option value="婚庆">婚庆</option>
            <option value="自制">自制</option>
            <option value="租赁">租赁</option>
          </select>
        </div>
        <div class="field full" style="justify-content: flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="ck" v-model="form.done" /> 已就绪
          </label>
        </div>
        <div class="field full">
          <label>备注</label>
          <input class="input" v-model="form.note" placeholder="选填" />
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
.stat-line { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; font-size: 13.5px; color: var(--secondary); }
.group-card { margin-bottom: 12px; padding: 14px 18px; }
.group-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.group-head .gi { font-size: 15px; }
.group-head .gs { font-size: 12.5px; flex: 1; text-align: right; }
.arrow { transition: transform .2s; color: var(--muted); }
.arrow.up { transform: rotate(180deg); }
.group-card .list { margin-top: 10px; }
</style>
