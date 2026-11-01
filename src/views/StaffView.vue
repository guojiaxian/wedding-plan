<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, toast } from '../api/client'
import type { Staff } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const ROLE_ICONS = ['总管', '统筹', '伴郎', '伴娘', '迎宾', '收礼', '记账', '保管', '车队', '司机', '酒店', '对接']

function roleIcon(role: string): string {
  for (const k of ROLE_ICONS) if (role.includes(k)) {
    return { 总管: '🧭', 统筹: '🧭', 伴郎: '🤵', 伴娘: '👰', 迎宾: '🤝', 收礼: '🧧', 记账: '🧧', 保管: '📦', 车队: '🚗', 司机: '🚗', 酒店: '🏨', 对接: '🏨' }[k] || '👤'
  }
  return '👤'
}

const staff = ref<Staff[]>([])
const loading = ref(true)

async function load() {
  try { staff.value = await api.get<Staff[]>('/staff') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const confirmed = computed(() => staff.value.filter(s => s.name.trim()).length)

const modal = ref(false)
const form = reactive({ id: 0, name: '', role: '', phone: '', duty: '', event_title: '' })

function openNew() {
  Object.assign(form, { id: 0, name: '', role: '', phone: '', duty: '', event_title: '' })
  modal.value = true
}
function openEdit(s: Staff) {
  Object.assign(form, { id: s.id, name: s.name, role: s.role, phone: s.phone, duty: s.duty, event_title: s.event_title })
  modal.value = true
}
async function save() {
  if (!form.role.trim()) return toast('请填写负责角色', 'err')
  try {
    if (form.id) await api.put(`/staff/${form.id}`, { ...form })
    else await api.post('/staff', { ...form })
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function remove(s: Staff) {
  if (!confirm(`删除「${s.role}」分工？`)) return
  try {
    await api.del(`/staff/${s.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">👥</span>人员分工</h2>
      <button class="btn btn-primary" @click="openNew">＋ 添加分工</button>
    </div>

    <div class="card stat-line">
      <span>共 <b class="num">{{ staff.length }}</b> 个岗位</span>
      <span>已确认人选 <b class="num pink">{{ confirmed }}</b> 个</span>
      <span v-if="confirmed < staff.length" class="muted">还有 {{ staff.length - confirmed }} 个岗位待定</span>
    </div>

    <div class="mt16" v-if="!loading && !staff.length">
      <EmptyState emoji="👥" text="还没有安排工作人员，把分工落实到人是婚礼顺利的关键" />
    </div>

    <div class="staff-grid">
      <div v-for="s in staff" :key="s.id" class="card staff-card">
        <div class="staff-head">
          <div class="staff-icon">{{ roleIcon(s.role) }}</div>
          <div class="grow">
            <div class="staff-role">{{ s.role }}</div>
            <div class="staff-name" :class="{ pending: !s.name.trim() }">{{ s.name.trim() || '人选待定' }}</div>
          </div>
          <div class="ops">
            <button class="btn btn-icon" @click="openEdit(s)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="remove(s)">🗑️</button>
          </div>
        </div>
        <div class="staff-duty" v-if="s.duty">{{ s.duty }}</div>
        <div class="staff-foot">
          <a v-if="s.phone" class="badge info" :href="`tel:${s.phone}`">📞 {{ s.phone }}</a>
          <span v-if="s.event_title" class="badge">⏰ {{ s.event_title }}</span>
        </div>
      </div>
    </div>

    <UiModal :open="modal" :title="form.id ? '编辑分工' : '添加分工'" @close="modal = false">
      <div class="form-grid">
        <div class="field">
          <label>负责角色</label>
          <input class="input" v-model="form.role" placeholder="如：伴郎 / 收礼金记账" />
        </div>
        <div class="field">
          <label>姓名</label>
          <input class="input" v-model="form.name" placeholder="人员姓名" />
        </div>
        <div class="field">
          <label>联系电话</label>
          <input class="input" type="tel" v-model="form.phone" placeholder="选填" />
        </div>
        <div class="field">
          <label>关联流程环节（选填）</label>
          <input class="input" v-model="form.event_title" placeholder="如：堵门游戏" />
        </div>
        <div class="field full">
          <label>职责说明</label>
          <input class="input" v-model="form.duty" placeholder="如：陪同新郎，保管戒指" />
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
.staff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.staff-card { padding: 16px; }
.staff-head { display: flex; align-items: center; gap: 10px; }
.staff-icon {
  width: 42px; height: 42px; border-radius: 12px; font-size: 20px; flex-shrink: 0;
  background: var(--primary-soft); display: flex; align-items: center; justify-content: center;
}
.staff-role { font-weight: 700; font-size: 14.5px; }
.staff-name { font-size: 13px; color: var(--accent-deep); font-weight: 600; margin-top: 1px; }
.staff-name.pending { color: var(--muted); font-weight: 400; }
.staff-duty { font-size: 13px; color: var(--secondary); margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.staff-foot { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
</style>
