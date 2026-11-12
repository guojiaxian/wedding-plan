<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, toast } from '../api/client'
import type { TimelineEvent } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const events = ref<TimelineEvent[]>([])
const loading = ref(true)

async function load() {
  try { events.value = await api.get<TimelineEvent[]>('/timeline') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const totalDurationMin = computed(() => events.value.reduce((s, e) => {
  // 支持“1小时30分钟”等多段时长：逐段累加
  const re = /(\d+(?:\.\d+)?)\s*(小时|分钟)?/g
  let m, total = s
  while ((m = re.exec(e.duration || ''))) {
    const v = parseFloat(m[1])
    total += m[2] === '小时' ? v * 60 : v
  }
  return total
}, 0))

const modal = ref(false)
const form = reactive({ id: 0, time: '', title: '', duration: '', location: '', owner: '', note: '' })

function openNew() {
  Object.assign(form, { id: 0, time: '', title: '', duration: '', location: '', owner: '', note: '' })
  modal.value = true
}
function openEdit(e: TimelineEvent) {
  Object.assign(form, { id: e.id, time: e.time, title: e.title, duration: e.duration, location: e.location, owner: e.owner, note: e.note })
  modal.value = true
}
async function save() {
  if (!form.title.trim()) return toast('请填写环节名称', 'err')
  try {
    if (form.id) await api.put(`/timeline/${form.id}`, { ...form })
    // 新环节排在末尾：取现有最大 sort + 1（用 length 会与历史 sort 重复/跳跃的环节撞车，导致上移失效）
    else await api.post('/timeline', { ...form, sort: Math.max(0, ...events.value.map(e => e.sort ?? 0)) + 1 })
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function remove(e: TimelineEvent) {
  if (!confirm(`删除环节「${e.title}」？`)) return
  try {
    await api.del(`/timeline/${e.id}`)
    toast('已删除')
    load()
  } catch (err: any) { toast(err.message, 'err') }
}

async function move(e: TimelineEvent, dir: -1 | 1) {
  const idx = events.value.findIndex(x => x.id === e.id)
  if (idx < 0 || !events.value[idx + dir]) return
  // 按展示顺序交换位置后，整体归一化 sort 为 0..n-1：
  // 只交换两项 sort 时，若历史数据存在重复/跳跃（如相邻两项同为 11），交换后顺序不变，表现为按钮无效
  const arr = [...events.value]
  ;[arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]]
  try {
    await Promise.all(arr.map((it, i) => it.sort === i ? null : api.put(`/timeline/${it.id}`, { sort: i })))
    load()
  } catch (err: any) { toast(err.message, 'err') }
}

async function loadTemplate() {
  if (!confirm('将用经典流程模板覆盖当前全部流程环节，确定继续吗？')) return
  try {
    await api.post('/timeline/template')
    toast('已载入流程模板 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">⏰</span>婚礼流程</h2>
      <div class="page-actions">
        <button class="btn" @click="loadTemplate">🎁 载入经典模板</button>
        <button class="btn btn-primary" @click="openNew">＋ 添加环节</button>
      </div>
    </div>

    <div class="card stat-line" v-if="events.length">
      <span>共 <b class="num">{{ events.length }}</b> 个环节</span>
      <span>标注时长合计 <b class="num pink">约 {{ Math.round(totalDurationMin / 60 * 10) / 10 }} 小时</b></span>
      <span class="muted">从 {{ events[0]?.time || '—' }} 开始</span>
    </div>

    <div class="card mt16" v-if="!loading && !events.length">
      <EmptyState emoji="⏰" text="还没有安排婚礼当天流程">
        <button class="btn btn-primary" @click="loadTemplate">🎁 一键载入经典流程模板</button>
      </EmptyState>
    </div>

    <!-- 时间轴 -->
    <div class="timeline mt16" v-if="events.length">
      <div v-for="(e, idx) in events" :key="e.id" class="tl-item">
        <div class="tl-rail">
          <div class="tl-dot">{{ e.time?.slice(0, 2) || '--' }}</div>
          <div class="tl-line" v-if="idx < events.length - 1"></div>
        </div>
        <div class="card tl-card">
          <div class="tl-head">
            <div class="grow">
              <div class="tl-time num">{{ e.time || '--:--' }}</div>
              <div class="tl-title">{{ e.title }}</div>
            </div>
            <div class="ops">
              <button class="btn btn-icon" :disabled="idx === 0" @click="move(e, -1)" title="上移">↑</button>
              <button class="btn btn-icon" :disabled="idx === events.length - 1" @click="move(e, 1)" title="下移">↓</button>
              <button class="btn btn-icon" @click="openEdit(e)">✏️</button>
              <button class="btn btn-icon btn-danger-ghost" @click="remove(e)">🗑️</button>
            </div>
          </div>
          <div class="tl-meta">
            <span v-if="e.duration" class="badge">⏱ {{ e.duration }}</span>
            <span v-if="e.location" class="badge info">📍 {{ e.location }}</span>
            <span v-if="e.owner" class="badge ok">👤 {{ e.owner }}</span>
          </div>
          <div class="tl-note muted" v-if="e.note">{{ e.note }}</div>
        </div>
      </div>
    </div>

    <UiModal :open="modal" :title="form.id ? '编辑环节' : '添加环节'" @close="modal = false">
      <div class="form-grid">
        <div class="field">
          <label>开始时间</label>
          <input class="input" type="time" v-model="form.time" />
        </div>
        <div class="field">
          <label>预计时长</label>
          <input class="input" v-model="form.duration" placeholder="如：30分钟 / 2小时" />
        </div>
        <div class="field full">
          <label>环节名称</label>
          <input class="input" v-model="form.title" placeholder="如：证婚仪式" @keyup.enter="save" />
        </div>
        <div class="field">
          <label>地点</label>
          <input class="input" v-model="form.location" placeholder="如：主舞台" />
        </div>
        <div class="field">
          <label>负责人</label>
          <input class="input" v-model="form.owner" placeholder="如：司仪 / 伴郎团" />
        </div>
        <div class="field full">
          <label>备注</label>
          <input class="input" v-model="form.note" placeholder="注意事项等" />
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
.timeline { display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 14px; }
.tl-rail { display: flex; flex-direction: column; align-items: center; width: 44px; flex-shrink: 0; }
.tl-dot {
  width: 44px; height: 30px; border-radius: 999px;
  background: var(--grad-brand);
  color: #fff; font-size: 11.5px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow);
}
.tl-line { flex: 1; width: 2px; background: var(--line); margin: 4px 0; min-height: 14px; }
.tl-card { flex: 1; margin-bottom: 12px; padding: 14px 16px; }
.tl-head { display: flex; align-items: flex-start; gap: 8px; }
.tl-time { font-size: 12.5px; color: var(--accent-deep); font-weight: 700; }
.tl-title { font-size: 15.5px; font-weight: 700; margin-top: 1px; }
.tl-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.tl-note { font-size: 12.5px; margin-top: 7px; }
@media (max-width: 600px) {
  .tl-rail { width: 36px; }
  .tl-dot { width: 36px; height: 26px; font-size: 10.5px; }
  .tl-card { padding: 12px 14px; }
  .tl-title { font-size: 14.5px; }
}
</style>
