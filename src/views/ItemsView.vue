<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, money, toast } from '../api/client'
import type { BudgetCategory, Item } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'

const ITEM_CATS = [
  { key: 'bride', label: '新娘', icon: '👗' },
  { key: 'groom', label: '新郎', icon: '🤵' },
  { key: 'ceremony', label: '仪式用品', icon: '💍' },
  { key: 'favor', label: '喜品伴手礼', icon: '🎁' },
  { key: 'other', label: '其他', icon: '📦' }
]

const items = ref<Item[]>([])
const cats = ref<BudgetCategory[]>([])
const filter = ref<'all' | 'no' | 'yes'>('all')
const collapsed = ref<Record<string, boolean>>({})
const loading = ref(true)

async function load() {
  try {
    const [it, c] = await Promise.all([api.get<Item[]>('/items'), api.get<BudgetCategory[]>('/budget-categories')])
    items.value = it; cats.value = c
  } catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const filtered = computed(() => items.value.filter(i =>
  filter.value === 'all' || (filter.value === 'yes' ? i.purchased : !i.purchased)
))
const grouped = computed(() => ITEM_CATS.map(c => ({
  ...c,
  list: filtered.value.filter(i => i.category === c.key)
})).filter(g => g.list.length))

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

const catName = (id: number | null) => cats.value.find(c => c.id === id)?.name || ''

// ===== 编辑 =====
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
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">🛍️</span>物品清单</h2>
      <button class="btn btn-primary" @click="openNew('bride')">＋ 添加物品</button>
    </div>

    <div class="card stat-line">
      <span>共 <b class="num">{{ stats.total }}</b> 件</span>
      <span>已购 <b class="num pink">{{ stats.purchased }}</b> 件</span>
      <span>预计合计 <b class="num gold">¥{{ money(stats.estimated) }}</b></span>
      <span>实付合计 <b class="num gold">¥{{ money(stats.actual) }}</b></span>
    </div>

    <div class="chip-row mt16 mb16">
      <button class="chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button class="chip" :class="{ active: filter === 'no' }" @click="filter = 'no'">未购置</button>
      <button class="chip" :class="{ active: filter === 'yes' }" @click="filter = 'yes'">已购置</button>
    </div>

    <div v-if="!loading && !grouped.length">
      <EmptyState emoji="🛒" text="这里还空空的，添加第一件备婚物品吧" />
    </div>

    <div v-for="g in grouped" :key="g.key" class="card group-card">
      <div class="group-head" @click="collapsed[g.key] = !collapsed[g.key]">
        <span class="gi">{{ g.icon }} <b>{{ g.label }}</b></span>
        <span class="muted gs">{{ catDone(g.key) }}/{{ catTotal(g.key) }} · 约 ¥{{ money(catSpent(g.key)) }}</span>
        <span class="arrow" :class="{ up: !collapsed[g.key] }">▾</span>
      </div>
      <div class="list" v-show="!collapsed[g.key]">
        <div v-for="i in g.list" :key="i.id" class="row" :class="{ done: i.purchased }">
          <input type="checkbox" class="ck" :checked="!!i.purchased" @change="toggleBuy(i)" />
          <div class="grow">
            <div class="name">
              {{ i.name }}
              <span v-if="catName(i.budget_category_id)" class="badge info" style="margin-left:6px">计入·{{ catName(i.budget_category_id) }}</span>
            </div>
            <div class="sub">
              <span v-if="!i.purchased">预计 ¥{{ money(i.estimated_price) }}</span>
              <span v-else>实付 ¥{{ money(i.actual_price) }}</span>
              <span v-if="i.channel"> · {{ i.channel }}</span>
              <span v-if="i.note"> · {{ i.note }}</span>
            </div>
          </div>
          <div class="price num">¥{{ money(i.purchased ? i.actual_price : i.estimated_price) }}</div>
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
            <option v-for="c in ITEM_CATS" :key="c.key" :value="c.key">{{ c.icon }} {{ c.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>计入预算分类（选填）</label>
          <select class="select" v-model="form.budget_category_id">
            <option :value="null">不计入</option>
            <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }}</option>
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
  </div>
</template>

<style scoped>
.stat-line { display: flex; gap: 22px; flex-wrap: wrap; font-size: 13.5px; color: var(--secondary); }
.group-card { margin-bottom: 12px; padding: 14px 18px; }
.group-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 2px 0; }
.group-head .gi { font-size: 15px; }
.group-head .gs { font-size: 12.5px; flex: 1; text-align: right; }
.arrow { transition: transform .2s; color: var(--muted); }
.arrow.up { transform: rotate(180deg); }
.group-card .list { margin-top: 10px; }
@media (max-width: 600px) {
  .row .price { font-size: 13px; }
  .row .sub { font-size: 11.5px; }
}
</style>
