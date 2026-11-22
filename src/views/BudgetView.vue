<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, money, toast } from '../api/client'
import { useAppStore } from '../stores/app'
import type { Expense, Summary } from '../api/types'
import RingChart from '../components/RingChart.vue'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useAppStore()
const summary = ref<Summary | null>(null)
const expenses = ref<Expense[]>([])

async function load() {
  try {
    const [s, e] = await Promise.all([
      api.get<Summary>('/summary'),
      api.get<Expense[]>('/expenses')
    ])
    summary.value = s; expenses.value = e
    store.loadSettings()
  } catch (e: any) { toast(e.message, 'err') }
}
onMounted(load)

const totalSpent = computed(() => summary.value?.budget.totalSpent || 0)
// 各花销项总价合计
const plannedTotal = computed(() => summary.value?.budget.categories.reduce((s, c) => s + (c.budget || 0), 0) || 0)
const hasPlanned = computed(() => plannedTotal.value > 0)
const plannedPercent = computed(() => hasPlanned.value ? Math.round((totalSpent.value / plannedTotal.value) * 100) : 0)
const remainPlanned = computed(() => Math.max(0, plannedTotal.value - totalSpent.value))

// 花销项：一项一行，与付款笔数无关（已付为累计数，付尾款后直接更新）
// spent = paid（手动累计）+ 已购物品自动计入；未分类支出单独一行
const groups = computed(() => {
  const gs = (summary.value?.budget.categories || []).map(c => {
    const paid = Number(c.paid) || 0
    const spent = c.spent || 0
    return {
      key: 'c' + c.id,
      id: c.id,
      name: c.name,
      paid,
      spent,
      total: c.budget || 0,
      // 待支付 = 总价 − 已付合计；未设总价为 null
      remain: (c.budget || 0) > 0 ? Math.round(((c.budget || 0) - spent) * 100) / 100 : null,
      itemsSpent: Math.max(0, Math.round((spent - paid) * 100) / 100)
    }
  })
  const uncat = expenses.value.filter(e => e.category_id == null)
  if (uncat.length) gs.push({
    key: 'uncat', id: 0, name: '未分类', paid: 0,
    spent: uncat.reduce((s, e) => s + e.amount, 0), total: 0, remain: null, itemsSpent: 0
  })
  return gs
})

// ===== 添加花销：总价 + 已付（定金/全款），或不填总价记一笔完整支出 =====
const addModal = ref(false)
const addForm = reactive({ name: '', total: 0, paid: 0 })

function openAdd() {
  Object.assign(addForm, { name: '', total: 0, paid: 0 })
  addModal.value = true
}
async function saveAdd() {
  if (!addForm.name.trim()) return toast('请填写名称', 'err')
  try {
    await api.post('/budget-categories', { name: addForm.name.trim(), budget: Number(addForm.total) || 0, paid: Number(addForm.paid) || 0 })
    addModal.value = false
    toast('已添加 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

// ===== 编辑：付尾款后把「已付」更新为累计金额 =====
const catModal = ref(false)
const catForm = reactive({ id: 0, name: '', total: 0, paid: 0, itemsSpent: 0 })

function openCatEdit(g: { id: number; name: string; total: number; paid: number; itemsSpent: number }) {
  Object.assign(catForm, { id: g.id, name: g.name, total: g.total, paid: g.paid, itemsSpent: g.itemsSpent })
  catModal.value = true
}
async function saveCat() {
  if (!catForm.name.trim()) return toast('请填写名称', 'err')
  try {
    await api.put(`/budget-categories/${catForm.id}`, {
      name: catForm.name,
      budget: Number(catForm.total) || 0,
      paid: Number(catForm.paid) || 0
    })
    catModal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function removeCat(g: { id: number; name: string }) {
  if (!confirm(`删除「${g.name}」？`)) return
  try {
    await api.del(`/budget-categories/${g.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">💰</span>花销规划</h2>
      <div class="page-actions">
        <button class="btn btn-primary" @click="openAdd">＋ 添加花销</button>
      </div>
    </div>

    <!-- 总览 -->
    <div class="card overview">
      <RingChart v-if="hasPlanned" :percent="plannedPercent" :size="136" :color="plannedPercent > 100 ? '#C96F6F' : ''">
        <div class="num" style="font-size: 24px; font-weight: 800" :style="{ color: plannedPercent > 100 ? 'var(--danger)' : 'var(--primary-deep)' }">{{ plannedPercent }}%</div>
        <div class="muted" style="font-size: 11px">已付占总价</div>
      </RingChart>
      <div class="ov-stats">
        <div class="ov-item">
          <div class="muted">已花费</div>
          <div class="num big pink">¥{{ money(totalSpent) }}</div>
        </div>
        <div class="ov-item" v-if="hasPlanned">
          <div class="muted">待支付</div>
          <div class="num big" :style="{ color: totalSpent > plannedTotal ? 'var(--danger)' : '' }">¥{{ money(remainPlanned) }}</div>
        </div>
        <div class="ov-item" v-if="hasPlanned">
          <div class="muted">总价合计</div>
          <div class="num big">¥{{ money(plannedTotal) }}</div>
        </div>
      </div>
      <div class="ov-tip muted" v-if="!hasPlanned">
        💡 添加花销时填写总价（如婚宴 26888），即可自动计算待支付
      </div>
    </div>

    <!-- 花销明细：一项一行 -->
    <h3 class="section-title">🧾 花销明细（{{ groups.length }} 项 · 已付 ¥{{ money(totalSpent) }}）</h3>
    <div class="card">
      <div class="cat-list" v-if="groups.length">
        <div v-for="g in groups" :key="g.key" class="cat-line">
          <b class="cname">{{ g.name }}</b>
          <span class="cnums num">
            <template v-if="g.total">
              <span :class="{ 'over': g.spent > g.total }">已付 ¥{{ money(g.spent) }} <span class="muted">/ ¥{{ money(g.total) }}</span></span>
              <span v-if="g.remain !== null && g.remain >= 0">· 待支付 <b class="pink">¥{{ money(g.remain) }}</b></span>
              <span v-else-if="g.remain !== null" class="over">· 已超出 ¥{{ money(-g.remain) }}</span>
            </template>
            <span v-else-if="g.spent > 0">已付 ¥{{ money(g.spent) }}</span>
            <span v-else class="muted">未设总价</span>
            <span class="muted" v-if="g.itemsSpent > 0">· 含已购物品 ¥{{ money(g.itemsSpent) }}</span>
          </span>
          <span class="ops" v-if="g.id">
            <button class="btn btn-icon" title="编辑名称 / 总价 / 已付" @click="openCatEdit(g)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="removeCat(g)">🗑️</button>
          </span>
        </div>
      </div>
      <EmptyState v-else text="还没有花销项，点击右上角「添加花销」开始" />
    </div>

    <!-- 添加花销弹窗 -->
    <UiModal :open="addModal" title="添加花销" @close="addModal = false">
      <div class="muted form-tip">有尾款的填「总价 + 已付定金」，待支付自动算；一次付清的（如买首饰）只填已付</div>
      <div class="form-grid">
        <div class="field full">
          <label>名称</label>
          <input class="input" v-model="addForm.name" placeholder="如：婚宴酒席 / 婚戒首饰" @keyup.enter="saveAdd" />
        </div>
        <div class="field">
          <label>总价（元，选填）</label>
          <input class="input" type="number" min="0" step="100" v-model.number="addForm.total" placeholder="如：26888" />
        </div>
        <div class="field">
          <label>已付（元，选填）</label>
          <input class="input" type="number" min="0" step="0.01" v-model.number="addForm.paid" placeholder="定金或全款" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="addModal = false">取消</button>
        <button class="btn btn-primary" @click="saveAdd">保存</button>
      </template>
    </UiModal>

    <!-- 编辑花销弹窗 -->
    <UiModal :open="catModal" title="编辑花销" @close="catModal = false">
      <div class="form-grid">
        <div class="field full">
          <label>名称</label>
          <input class="input" v-model="catForm.name" placeholder="如：婚宴酒席" @keyup.enter="saveCat" />
        </div>
        <div class="field">
          <label>总价（元，选填）</label>
          <input class="input" type="number" min="0" step="100" v-model.number="catForm.total" placeholder="如：26888" />
        </div>
        <div class="field">
          <label>已付（元，累计）</label>
          <input class="input" type="number" min="0" step="0.01" v-model.number="catForm.paid" placeholder="定金 + 尾款累计" />
        </div>
      </div>
      <div class="muted form-tip" v-if="catForm.itemsSpent > 0">
        另有已购物品自动计入 ¥{{ money(catForm.itemsSpent) }}，无需填进「已付」
      </div>
      <template #footer>
        <button class="btn" @click="catModal = false">取消</button>
        <button class="btn btn-primary" @click="saveCat">保存</button>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.overview { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
.ov-stats { display: flex; gap: 34px; flex: 1; flex-wrap: wrap; }
.ov-item .big { font-size: 22px; font-weight: 800; margin-top: 4px; }
.ov-tip { flex-basis: 100%; font-size: 13px; }
.cat-list { display: flex; flex-direction: column; gap: 4px; }
.cat-line {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px;
  padding: 11px 12px; border-radius: var(--radius-sm);
  transition: background .15s;
}
.cat-line:hover { background: var(--primary-soft); }
.cname { font-size: 14.5px; }
.cnums { margin-left: auto; display: flex; flex-wrap: wrap; gap: 2px 0; font-size: 13.5px; }
.cnums b { font-size: 15px; }
.cnums .over { color: var(--danger); }
.ops { display: flex; gap: 6px; }
.form-tip { font-size: 12.5px; margin-top: 10px; }
@media (max-width: 480px) { .ov-stats { gap: 18px; } .ov-item .big { font-size: 18px; } }
</style>
