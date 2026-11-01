<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, money, toast } from '../api/client'
import { useAppStore } from '../stores/app'
import type { BudgetCategory, Expense, Summary } from '../api/types'
import RingChart from '../components/RingChart.vue'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useAppStore()
const summary = ref<Summary | null>(null)
const cats = ref<BudgetCategory[]>([])
const expenses = ref<Expense[]>([])

async function load() {
  try {
    const [s, c, e] = await Promise.all([
      api.get<Summary>('/summary'),
      api.get<BudgetCategory[]>('/budget-categories'),
      api.get<Expense[]>('/expenses')
    ])
    summary.value = s; cats.value = c; expenses.value = e
    store.loadSettings()
  } catch (e: any) { toast(e.message, 'err') }
}
onMounted(load)

const totalBudget = computed(() => summary.value?.budget.totalBudget || 0)
const totalSpent = computed(() => summary.value?.budget.totalSpent || 0)
// 未设置总预算时不展示比例类数据（环图/百分比/剩余），仅显示已花费
const hasBudget = computed(() => totalBudget.value > 0)
const percent = computed(() => hasBudget.value ? Math.round((totalSpent.value / totalBudget.value) * 100) : 0)
const catName = (id: number | null) => cats.value.find(c => c.id === id)?.name || '未分类'

// ===== 分类编辑 =====
const catModal = ref(false)
const catForm = reactive({ id: 0, name: '', budget: 0 })

function openCatNew() {
  Object.assign(catForm, { id: 0, name: '', budget: 0 })
  catModal.value = true
}
function openCatEdit(c: BudgetCategory) {
  Object.assign(catForm, { id: c.id, name: c.name, budget: c.budget })
  catModal.value = true
}
async function saveCat() {
  if (!catForm.name.trim()) return toast('请填写分类名称', 'err')
  try {
    if (catForm.id) await api.put(`/budget-categories/${catForm.id}`, { name: catForm.name, budget: Number(catForm.budget) || 0 })
    else await api.post('/budget-categories', { name: catForm.name, budget: Number(catForm.budget) || 0 })
    catModal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function removeCat(c: BudgetCategory) {
  if (!confirm(`删除分类「${c.name}」？其名下支出记录将保留并继续计入总支出（显示为“未分类”）。`)) return
  try {
    await api.del(`/budget-categories/${c.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

// ===== 支出编辑 =====
const expModal = ref(false)
const expForm = reactive({ id: 0, name: '', amount: 0, category_id: null as number | null, date: '', dateTbd: false, note: '' })

function today() { return new Date().toISOString().slice(0, 10) }
function onExpDateTbd(v: boolean) {
  expForm.dateTbd = v
  if (v) expForm.date = ''
}

function openExpNew() {
  Object.assign(expForm, { id: 0, name: '', amount: 0, category_id: cats.value[0]?.id ?? null, date: today(), dateTbd: false, note: '' })
  expModal.value = true
}
function openExpEdit(e: Expense) {
  Object.assign(expForm, { id: e.id, name: e.name, amount: e.amount, category_id: e.category_id, date: e.date, dateTbd: !e.date, note: e.note })
  expModal.value = true
}
async function saveExp() {
  if (!expForm.name.trim()) return toast('请填写支出名称', 'err')
  try {
    const body = { name: expForm.name, amount: Number(expForm.amount) || 0, category_id: expForm.category_id, date: expForm.dateTbd ? '' : expForm.date, note: expForm.note }
    if (expForm.id) await api.put(`/expenses/${expForm.id}`, body)
    else await api.post('/expenses', body)
    expModal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function removeExp(e: Expense) {
  if (!confirm(`删除支出「${e.name}」？`)) return
  try {
    await api.del(`/expenses/${e.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

function barClass(spent: number, budget: number) {
  if (!budget) return spent > 0 ? 'danger' : ''
  const p = spent / budget
  return p > 1 ? 'danger' : p > 0.85 ? 'warn' : ''
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">💰</span>预算规划</h2>
      <div class="page-actions">
        <button class="btn" @click="openCatNew">＋ 预算分类</button>
        <button class="btn btn-primary" @click="openExpNew">＋ 记一笔支出</button>
      </div>
    </div>

    <!-- 总览 -->
    <div class="card overview">
      <RingChart v-if="hasBudget" :percent="percent" :size="136" :color="percent > 100 ? '#C96F6F' : ''">
        <div class="num" style="font-size: 24px; font-weight: 800" :style="{ color: percent > 100 ? 'var(--danger)' : 'var(--primary-deep)' }">{{ percent }}%</div>
        <div class="muted" style="font-size: 11px">已使用</div>
      </RingChart>
      <div class="ov-stats">
        <div class="ov-item">
          <div class="muted">总预算</div>
          <div class="num big" v-if="hasBudget">¥{{ money(totalBudget) }}</div>
          <div class="big muted" v-else style="font-size: 16px; line-height: 2">未设置</div>
        </div>
        <div class="ov-item">
          <div class="muted">已花费</div>
          <div class="num big pink">¥{{ money(totalSpent) }}</div>
        </div>
        <div class="ov-item" v-if="hasBudget">
          <div class="muted">剩余</div>
          <div class="num big" :style="{ color: totalBudget - totalSpent >= 0 ? 'var(--success)' : 'var(--danger)' }">¥{{ money(totalBudget - totalSpent) }}</div>
        </div>
      </div>
      <div class="ov-tip muted" v-if="!hasBudget">
        💡 还未设置总预算，<router-link to="/settings" class="pink">去设置</router-link>后即可查看使用比例与剩余额度
      </div>
    </div>

    <!-- 分类预算 -->
    <h3 class="section-title">📊 分类预算（含已购物品自动计入）</h3>
    <div class="card">
      <div class="cat-list" v-if="summary?.budget.categories.length">
        <div v-for="c in summary.budget.categories" :key="c.id" class="cat-row">
          <div class="cat-head">
            <b>{{ c.name }}</b>
            <span class="num" :class="{ 'over': c.budget && c.spent > c.budget }">
              ¥{{ money(c.spent) }} <span class="muted">/ ¥{{ money(c.budget) }}</span>
            </span>
          </div>
          <div class="progress" :class="barClass(c.spent, c.budget)">
            <i :style="{ width: c.budget ? Math.min(100, Math.round(c.spent / c.budget * 100)) + '%' : (c.spent > 0 ? '100%' : '0%') }" />
          </div>
          <div class="cat-ops">
            <span class="muted sub-text" v-if="c.budget">已用 {{ Math.round(c.spent / c.budget * 100) }}%</span>
            <span class="muted sub-text" v-else>未设上限</span>
            <span style="flex:1"></span>
            <button class="btn btn-icon" @click="openCatEdit(c)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="removeCat(c)">🗑️</button>
          </div>
        </div>
      </div>
      <EmptyState v-else text="还没有预算分类，点击右上角「预算分类」创建" />
    </div>

    <!-- 支出记录 -->
    <h3 class="section-title">🧾 支出记录（{{ expenses.length }} 笔 · ¥{{ money(expenses.reduce((s, e) => s + e.amount, 0)) }}）</h3>
    <div class="card">
      <div class="list" v-if="expenses.length">
        <div v-for="e in expenses" :key="e.id" class="row">
          <div class="grow">
            <div class="name">{{ e.name }}</div>
            <div class="sub"><span v-if="e.date">{{ e.date }}</span><span v-else class="tbd-badge">日期待定</span> · {{ catName(e.category_id) }}<span v-if="e.note"> · {{ e.note }}</span></div>
          </div>
          <div class="price num">¥{{ money(e.amount) }}</div>
          <div class="ops">
            <button class="btn btn-icon" @click="openExpEdit(e)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="removeExp(e)">🗑️</button>
          </div>
        </div>
      </div>
      <EmptyState v-else text="暂无支出记录" />
    </div>

    <!-- 分类弹窗 -->
    <UiModal :open="catModal" :title="catForm.id ? '编辑预算分类' : '新增预算分类'" @close="catModal = false">
      <div class="form-grid">
        <div class="field">
          <label>分类名称</label>
          <input class="input" v-model="catForm.name" placeholder="如：婚宴酒席" @keyup.enter="saveCat" />
        </div>
        <div class="field">
          <label>预算上限（元）</label>
          <input class="input" type="number" min="0" step="100" v-model.number="catForm.budget" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="catModal = false">取消</button>
        <button class="btn btn-primary" @click="saveCat">保存</button>
      </template>
    </UiModal>

    <!-- 支出弹窗 -->
    <UiModal :open="expModal" :title="expForm.id ? '编辑支出' : '记一笔支出'" @close="expModal = false">
      <div class="form-grid">
        <div class="field full">
          <label>支出名称</label>
          <input class="input" v-model="expForm.name" placeholder="如：婚宴定金" />
        </div>
        <div class="field">
          <label>金额（元）</label>
          <input class="input" type="number" min="0" step="0.01" v-model.number="expForm.amount" />
        </div>
        <div class="field">
          <label>日期</label>
          <div class="date-row">
            <input class="input" type="date" v-model="expForm.date" :disabled="expForm.dateTbd" />
            <label class="tbd-toggle">
              <input type="checkbox" class="ck" :checked="expForm.dateTbd" @change="onExpDateTbd(($event.target as HTMLInputElement).checked)" /> 待定
            </label>
          </div>
        </div>
        <div class="field">
          <label>预算分类</label>
          <select class="select" v-model="expForm.category_id">
            <option :value="null">未分类</option>
            <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>备注</label>
          <input class="input" v-model="expForm.note" placeholder="选填" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="expModal = false">取消</button>
        <button class="btn btn-primary" @click="saveExp">保存</button>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.overview { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.ov-stats { display: flex; gap: 34px; flex: 1; flex-wrap: wrap; }
.ov-item .big { font-size: 22px; font-weight: 800; margin-top: 4px; }
.ov-tip { flex-basis: 100%; font-size: 13px; }
.cat-list { display: flex; flex-direction: column; gap: 16px; }
.cat-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; font-size: 14.5px; }
.cat-head .over { color: var(--danger); }
.cat-ops { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.sub-text { font-size: 12px; }
@media (max-width: 480px) { .ov-stats { gap: 18px; } .ov-item .big { font-size: 18px; } }
</style>
