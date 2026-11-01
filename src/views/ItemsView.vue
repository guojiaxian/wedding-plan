<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, money, toast } from '../api/client'
import type { BudgetCategory, Item, ItemCategory } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const items = ref<Item[]>([])
const cats = ref<ItemCategory[]>([])
const budgetCats = ref<BudgetCategory[]>([])
const filter = ref<'all' | 'no' | 'yes'>('all')
const collapsed = ref<Record<string, boolean>>({})
const loading = ref(true)

async function load() {
  try {
    const [it, c, bc] = await Promise.all([
      api.get<Item[]>('/items'),
      api.get<ItemCategory[]>('/item-categories'),
      api.get<BudgetCategory[]>('/budget-categories')
    ])
    items.value = it; cats.value = c; budgetCats.value = bc
  } catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

// 分组：按分类表渲染（空分类也显示，便于看到新分类）；已删除分类的遗留物品归入「未分类」
const grouped = computed(() => {
  const groups = cats.value.map(c => ({
    key: c.key,
    name: c.name,
    icon: c.icon,
    cat: c,
    list: filtered.value.filter(i => i.category === c.key)
  }))
  const keys = new Set(cats.value.map(c => c.key))
  const orphans = filtered.value.filter(i => !keys.has(i.category))
  if (orphans.length) groups.push({ key: '__orphan__', name: '未分类', icon: '📦', cat: null, list: orphans })
  return groups
})
const activeCatCount = computed(() => grouped.value.length)

const filtered = computed(() => items.value.filter(i =>
  filter.value === 'all' || (filter.value === 'yes' ? i.purchased : !i.purchased)
))

const stats = computed(() => ({
  total: items.value.length,
  purchased: items.value.filter(i => i.purchased).length,
  estimated: items.value.reduce((s, i) => s + (i.estimated_price || 0), 0),
  actual: items.value.filter(i => i.purchased).reduce((s, i) => s + (i.actual_price || 0), 0)
}))
const catSpent = (key: string) => items.value
  .filter(i => i.category === key)
  .reduce((s, i) => s + (i.purchased ? (i.actual_price || 0) : (i.estimated_price || 0)), 0)
const catTotal = (key: string) => items.value.filter(i => i.category === key).length
const catDone = (key: string) => items.value.filter(i => i.category === key && i.purchased).length

const budgetCatName = (id: number | null) => budgetCats.value.find(c => c.id === id)?.name || ''

// ===== 物品编辑 =====
const modal = ref(false)
const form = reactive({
  id: 0, name: '', category: 'bride', budget_category_id: null as number | null,
  estimated_price: 0, actual_price: null as number | null, purchased: false,
  channel: '', note: ''
})

function openNew(catKey: string) {
  Object.assign(form, { id: 0, name: '', category: catKey, budget_category_id: null, estimated_price: 0, actual_price: null, purchased: false, channel: '', note: '' })
  modal.value = true
}
function openEdit(i: Item) {
  Object.assign(form, {
    id: i.id, name: i.name, category: i.category, budget_category_id: i.budget_category_id,
    estimated_price: i.estimated_price, actual_price: i.actual_price,
    purchased: !!i.purchased, channel: i.channel, note: i.note
  })
  modal.value = true
}
async function save() {
  if (!form.name.trim()) return toast('请填写物品名称', 'err')
  try {
    const body = {
      name: form.name, category: form.category, budget_category_id: form.budget_category_id,
      estimated_price: Number(form.estimated_price) || 0,
      actual_price: form.purchased ? (Number(form.actual_price) || 0) : null,
      purchased: form.purchased ? 1 : 0, channel: form.channel, note: form.note
    }
    if (form.id) await api.put(`/items/${form.id}`, body)
    else await api.post('/items', body)
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

async function toggleBuy(i: Item) {
  try {
    const purchased = i.purchased ? 0 : 1
    i.purchased = purchased
    if (!purchased) i.actual_price = null
    await api.put(`/items/${i.id}`, { purchased, actual_price: i.actual_price })
  } catch (e: any) { toast(e.message, 'err'); load() }
}
async function remove(i: Item) {
  if (!confirm(`删除物品「${i.name}」？`)) return
  try {
    await api.del(`/items/${i.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

// ===== 分类管理（自定义分类） =====
const catModal = ref(false)
const catForm = reactive({ id: 0, name: '', icon: '📦' })

function openCatNew() {
  Object.assign(catForm, { id: 0, name: '', icon: '📦' })
  catModal.value = true
}
function openCatEdit(c: ItemCategory) {
  Object.assign(catForm, { id: c.id, name: c.name, icon: c.icon || '📦' })
  catModal.value = true
}
async function saveCat() {
  if (!catForm.name.trim()) return toast('请填写分类名称', 'err')
  try {
    if (catForm.id) {
      await api.put(`/item-categories/${catForm.id}`, { name: catForm.name, icon: catForm.icon })
    } else {
      const maxSort = cats.value.reduce((s, c) => Math.max(s, c.sort), -1)
      await api.post('/item-categories', { name: catForm.name, icon: catForm.icon, sort: maxSort + 1 })
    }
    catModal.value = false
    toast('分类已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function removeCat(c: ItemCategory) {
  if (cats.value.length <= 1) return toast('至少保留一个分类', 'err')
  const n = catTotal(c.key)
  const fallback = cats.value.find(x => x.key !== c.key)!
  const msg = n > 0
    ? `分类「${c.name}」下有 ${n} 件物品，删除后将移入「${fallback.name}」，确定继续吗？`
    : `删除空分类「${c.name}」？`
  if (!confirm(msg)) return
  try {
    await api.del(`/item-categories/${c.id}${n > 0 ? `?moveTo=${fallback.key}` : ''}`)
    toast('分类已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">🛍️</span>物品清单</h2>
      <div class="page-actions">
        <button class="btn" @click="openCatNew">＋ 分类</button>
        <button class="btn btn-primary" @click="openNew(cats[0]?.key || 'other')">＋ 添加物品</button>
      </div>
    </div>

    <div class="card stat-line">
      <span>共 <b class="num">{{ stats.total }}</b> 件</span>
      <span>已购 <b class="num pink">{{ stats.purchased }}</b> 件</span>
      <span>预计合计 <b class="num gold">¥{{ money(stats.estimated) }}</b></span>
      <span>实付合计 <b class="num gold">¥{{ money(stats.actual) }}</b></span>
      <span class="muted">{{ cats.length }} 个分类</span>
    </div>

    <div class="chip-row mt16 mb16">
      <button class="chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button class="chip" :class="{ active: filter === 'no' }" @click="filter = 'no'">未购置</button>
      <button class="chip" :class="{ active: filter === 'yes' }" @click="filter = 'yes'">已购置</button>
    </div>

    <div v-if="!loading && !activeCatCount">
      <EmptyState emoji="🛒" text="这里还空空的，添加第一件备婚物品吧" />
    </div>

    <div v-for="g in grouped" :key="g.key" class="card group-card">
      <div class="group-head" @click="collapsed[g.key] = !collapsed[g.key]">
        <span class="gi">{{ g.icon }} <b>{{ g.name }}</b></span>
        <span class="muted gs">{{ catDone(g.key) }}/{{ catTotal(g.key) }} · 约 ¥{{ money(catSpent(g.key)) }}</span>
        <span class="g-ops" v-if="g.cat" @click.stop>
          <button class="btn btn-icon" title="编辑分类" @click="openCatEdit(g.cat)">✏️</button>
          <button class="btn btn-icon btn-danger-ghost" title="删除分类" @click="removeCat(g.cat)">🗑️</button>
        </span>
        <span class="arrow" :class="{ up: !collapsed[g.key] }">▾</span>
      </div>
      <div class="list" v-show="!collapsed[g.key]">
        <div v-if="!g.list.length" class="muted" style="font-size: 12.5px; padding: 4px 2px 2px">
          {{ filter === 'all' ? '该分类暂无物品' : '该分类下无符合筛选条件的物品' }}
        </div>
        <div v-for="i in g.list" :key="i.id" class="row" :class="{ done: i.purchased }">
          <input type="checkbox" class="ck" :checked="!!i.purchased" @change="toggleBuy(i)" />
          <div class="grow">
            <div class="name">
              {{ i.name }}
              <span v-if="budgetCatName(i.budget_category_id)" class="badge info" style="margin-left:6px">计入·{{ budgetCatName(i.budget_category_id) }}</span>
            </div>
            <div class="sub">
              <span v-if="!i.purchased">预计 ¥{{ money(i.estimated_price) }}</span>
              <span v-else-if="i.actual_price != null">实付 ¥{{ money(i.actual_price) }}</span>
              <span v-else>已购 · 实付未填（暂按预计 ¥{{ money(i.estimated_price) }}）</span>
              <span v-if="i.channel"> · {{ i.channel }}</span>
              <span v-if="i.note"> · {{ i.note }}</span>
            </div>
          </div>
          <div class="price num">¥{{ money(i.purchased ? (i.actual_price ?? i.estimated_price) : i.estimated_price) }}</div>
          <div class="ops">
            <button class="btn btn-icon" @click="openEdit(i)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="remove(i)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <UiModal :open="modal" :title="form.id ? '编辑物品' : '添加物品'" @close="modal = false">
      <div class="form-grid">
        <div class="field full">
          <label>物品名称</label>
          <input class="input" v-model="form.name" placeholder="如：主婚纱" @keyup.enter="save" />
        </div>
        <div class="field">
          <label>物品分类</label>
          <select class="select" v-model="form.category">
            <option v-for="c in cats" :key="c.key" :value="c.key">{{ c.icon }} {{ c.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>计入预算分类（选填）</label>
          <select class="select" v-model="form.budget_category_id">
            <option :value="null">不计入</option>
            <option v-for="c in budgetCats" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>预计价格（元）</label>
          <input class="input" type="number" min="0" step="0.01" v-model.number="form.estimated_price" />
        </div>
        <div class="field">
          <label>实际价格（元，已购时计入预算）</label>
          <input class="input" type="number" min="0" step="0.01" v-model.number="form.actual_price" :disabled="!form.purchased" />
        </div>
        <div class="field">
          <label>购买渠道</label>
          <input class="input" v-model="form.channel" placeholder="如：天猫 / 婚博会" />
        </div>
        <div class="field" style="justify-content: flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="ck" v-model="form.purchased" /> 已购置
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

    <!-- 分类新增/编辑 -->
    <UiModal :open="catModal" :title="catForm.id ? '编辑分类' : '新增分类'" @close="catModal = false">
      <div class="form-grid">
        <div class="field">
          <label>分类名称</label>
          <input class="input" v-model="catForm.name" placeholder="如：双方父母 / 伴郎伴娘" @keyup.enter="saveCat" />
        </div>
        <div class="field">
          <label>图标（emoji）</label>
          <input class="input" v-model="catForm.icon" placeholder="如：👨‍👩‍👧" maxlength="8" />
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="catModal = false">取消</button>
        <button class="btn btn-primary" @click="saveCat">保存</button>
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.stat-line { display: flex; gap: 22px; flex-wrap: wrap; font-size: 13.5px; color: var(--secondary); }
.group-card { margin-bottom: 12px; padding: 14px 18px; }
.group-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 2px 0; }
.group-head .gi { font-size: 15px; }
.group-head .gs { font-size: 12.5px; flex: 1; text-align: right; }
.g-ops { display: flex; gap: 4px; }
.arrow { transition: transform .2s; color: var(--muted); }
.arrow.up { transform: rotate(180deg); }
.group-card .list { margin-top: 10px; }
@media (max-width: 600px) {
  .row .price { font-size: 13px; }
  .row .sub { font-size: 11.5px; }
  .group-head .gs { font-size: 11.5px; }
}
</style>
