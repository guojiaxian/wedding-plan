<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, toast } from '../api/client'
import type { Task } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const PHASES = [
  { key: 'm12', label: '婚前 12 个月', icon: '🌱' },
  { key: 'm9', label: '婚前 9 个月', icon: '🌿' },
  { key: 'm6', label: '婚前 6 个月', icon: '🍀' },
  { key: 'm3', label: '婚前 3 个月', icon: '🌸' },
  { key: 'm1', label: '婚前 1 个月', icon: '🌺' },
  { key: 'w1', label: '婚礼当周', icon: '💐' }
]
const STATUS = { todo: '待办', doing: '进行中', done: '已完成' } as const

const tasks = ref<Task[]>([])
const filter = ref<'all' | 'todo' | 'doing' | 'done'>('all')
const loading = ref(true)

async function load() {
  try { tasks.value = await api.get<Task[]>('/tasks') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const filtered = computed(() => tasks.value.filter(t => filter.value === 'all' || t.status === filter.value))
const grouped = computed(() => PHASES.map(p => ({
  ...p,
  list: filtered.value.filter(t => t.phase === p.key)
})).filter(g => g.list.length))

const stats = computed(() => ({
  total: tasks.value.length,
  done: tasks.value.filter(t => t.status === 'done').length
}))

// 循环切换状态：待办 → 进行中 → 已完成 → 待办
async function cycleStatus(t: Task) {
  const order: Task['status'][] = ['todo', 'doing', 'done']
  const next = order[(order.indexOf(t.status) + 1) % 3]
  try {
    t.status = next
    await api.put(`/tasks/${t.id}`, { status: next })
  } catch (e: any) { toast(e.message, 'err'); load() }
}

const modal = ref(false)
const form = reactive({ id: 0, title: '', phase: 'm6', due_date: '', dateTbd: true, status: 'todo' as Task['status'], assignee: '', note: '' })

function onDueTbdChange(v: boolean) {
  form.dateTbd = v
  if (v) form.due_date = ''
}
function openNew(phase: string) {
  Object.assign(form, { id: 0, title: '', phase, due_date: '', dateTbd: true, status: 'todo' as Task['status'], assignee: '', note: '' })
  modal.value = true
}
function openEdit(t: Task) {
  Object.assign(form, { id: t.id, title: t.title, phase: t.phase, due_date: t.due_date, dateTbd: !t.due_date, status: t.status, assignee: t.assignee, note: t.note })
  modal.value = true
}
async function save() {
  if (!form.title.trim()) return toast('请填写任务内容', 'err')
  try {
    const body = { ...form, due_date: form.dateTbd ? '' : form.due_date }
    delete (body as any).dateTbd
    if (form.id) await api.put(`/tasks/${form.id}`, body)
    else await api.post('/tasks', body)
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function remove(t: Task) {
  if (!confirm(`删除任务「${t.title}」？`)) return
  try {
    await api.del(`/tasks/${t.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

function overdue(t: Task) {
  return t.due_date && t.status !== 'done' && t.due_date < new Date().toISOString().slice(0, 10)
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">📝</span>筹备任务</h2>
      <button class="btn btn-primary" @click="openNew('m6')">＋ 添加任务</button>
    </div>

    <div class="card stat-line">
      <span>共 <b class="num">{{ stats.total }}</b> 项任务</span>
      <span>已完成 <b class="num" style="color: var(--success)">{{ stats.done }}</b> 项</span>
      <span v-if="stats.total">完成率 <b class="num pink">{{ Math.round(stats.done / stats.total * 100) }}%</b></span>
    </div>

    <div class="chip-row mt16 mb16">
      <button v-for="f in ['all', 'todo', 'doing', 'done'] as const" :key="f"
              class="chip" :class="{ active: filter === f }" @click="filter = f">
        {{ f === 'all' ? '全部' : STATUS[f] }}
      </button>
    </div>

    <div v-if="!loading && !grouped.length">
      <EmptyState emoji="🗒️" text="该筛选下暂无任务" />
    </div>

    <div v-for="g in grouped" :key="g.key" class="card group-card">
      <div class="group-head">{{ g.icon }} <b>{{ g.label }}</b><span class="muted gs">{{ g.list.length }} 项</span></div>
      <div class="list">
        <div v-for="t in g.list" :key="t.id" class="row" :class="{ done: t.status === 'done' }">
          <button class="status-dot" :class="t.status" :title="`点击切换为「${STATUS[{ todo: 'doing', doing: 'done', done: 'todo' }[t.status]]}」`" @click="cycleStatus(t)">
            <span v-if="t.status === 'done'">✓</span>
            <span v-else-if="t.status === 'doing'">…</span>
          </button>
          <div class="grow">
            <div class="name">{{ t.title }}</div>
            <div class="sub">
              <span v-if="t.due_date" :class="{ 'over-due': overdue(t) }">截止 {{ t.due_date }}</span>
              <span v-else class="tbd-badge">截止待定</span>
              <span v-if="t.assignee"> · 👤 {{ t.assignee }}</span>
              <span v-if="t.note"> · {{ t.note }}</span>
            </div>
          </div>
          <span class="badge" :class="t.status === 'done' ? 'ok' : t.status === 'doing' ? 'warn' : 'mute'">{{ STATUS[t.status] }}</span>
          <div class="ops">
            <button class="btn btn-icon" @click="openEdit(t)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="remove(t)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <UiModal :open="modal" :title="form.id ? '编辑任务' : '添加任务'" @close="modal = false">
      <div class="form-grid">
        <div class="field full">
          <label>任务内容</label>
          <input class="input" v-model="form.title" placeholder="如：预定婚庆策划" @keyup.enter="save" />
        </div>
        <div class="field">
          <label>所属阶段</label>
          <select class="select" v-model="form.phase">
            <option v-for="p in PHASES" :key="p.key" :value="p.key">{{ p.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>截止日期</label>
          <div class="date-row">
            <input class="input" type="date" v-model="form.due_date" :disabled="form.dateTbd" />
            <label class="tbd-toggle">
              <input type="checkbox" class="ck" :checked="form.dateTbd" @change="onDueTbdChange(($event.target as HTMLInputElement).checked)" /> 待定
            </label>
          </div>
        </div>
        <div class="field">
          <label>负责人</label>
          <input class="input" v-model="form.assignee" placeholder="如：小雅 / 双方父母" />
        </div>
        <div class="field">
          <label>状态</label>
          <select class="select" v-model="form.status">
            <option value="todo">待办</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
          </select>
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
.stat-line { display: flex; gap: 22px; flex-wrap: wrap; font-size: 13.5px; color: var(--secondary); }
.group-card { margin-bottom: 12px; padding: 14px 18px; }
.group-head { display: flex; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 4px; }
.group-head .gs { font-size: 12.5px; flex: 1; text-align: right; }
.status-dot {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid var(--primary); background: #fff; color: #fff;
  cursor: pointer; font-size: 12px; line-height: 1; padding: 0;
  display: flex; align-items: center; justify-content: center;
}
.status-dot.doing { border-color: var(--warning); color: var(--warning); font-weight: 800; }
.status-dot.done { background: var(--success); border-color: var(--success); }
.over-due { color: var(--danger); font-weight: 600; }
</style>
