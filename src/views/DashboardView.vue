<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, money, toast } from '../api/client'
import { useAppStore } from '../stores/app'
import type { Summary, Task } from '../api/types'
import RingChart from '../components/RingChart.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useAppStore()
const summary = ref<Summary | null>(null)

onMounted(async () => {
  try {
    store.loadSettings()
    summary.value = await api.get<Summary>('/summary')
  } catch (e: any) { toast(e.message, 'err') }
})

const countdown = computed(() => store.countdownDays)
const budgetPercent = computed(() => {
  const b = summary.value?.budget
  if (!b || !b.totalBudget) return 0
  return Math.round((b.totalSpent / b.totalBudget) * 100)
})
const itemPercent = computed(() => {
  const it = summary.value?.items
  return it && it.total ? Math.round((it.purchased / it.total) * 100) : 0
})
const taskPercent = computed(() => {
  const t = summary.value?.tasks
  return t && t.total ? Math.round((t.done / t.total) * 100) : 0
})
const guestPercent = computed(() => {
  const g = summary.value?.guests
  return g && g.invitedHeads ? Math.round((g.confirmedHeads / g.invitedHeads) * 100) : 0
})

const countdownLabel = computed(() => {
  if (countdown.value === null) return '💍'
  if (countdown.value === 0) return '🎉'
  return `${Math.abs(countdown.value)}`
})

async function finishTask(t: Task) {
  try {
    t.status = 'done'
    await api.put(`/tasks/${t.id}`, { status: 'done' })
    toast('已完成 ✓')
    summary.value = await api.get<Summary>('/summary')
  } catch (e: any) { toast(e.message, 'err') }
}
</script>

<template>
  <div>
    <!-- 婚礼倒计时主卡 -->
    <div class="hero card">
      <div class="hero-left">
        <div class="hero-names">{{ store.coupleText }}</div>
        <div class="hero-line" v-if="store.dateText">📅 {{ store.dateText }}</div>
        <div class="hero-line" v-if="store.settings?.venue">📍 {{ store.settings.venue }}</div>
        <div class="hero-line muted" v-else>📍 待定婚礼场地 · <router-link to="/settings" class="pink">去设置</router-link></div>
      </div>
      <div class="hero-count">
        <template v-if="countdown !== null">
          <div class="n">{{ countdownLabel }}</div>
          <div class="t">{{ countdown > 0 ? '距婚礼还有（天）' : countdown === 0 ? '今天就是婚礼' : '婚礼已过去（天）' }}</div>
        </template>
        <template v-else>
          <div class="n">💍</div>
          <div class="t"><router-link to="/settings">设置婚礼日期</router-link></div>
        </template>
      </div>
    </div>

    <!-- 四项进度 -->
    <div class="stat-grid mt16" v-if="summary">
      <div class="stat-card">
        <div class="label">💰 预算使用</div>
        <div class="value pink">{{ budgetPercent }}%</div>
        <div class="sub">已花 ¥{{ money(summary.budget.totalSpent) }}</div>
        <div class="progress mt8"><i :style="{ width: budgetPercent + '%' }" /></div>
      </div>
      <div class="stat-card">
        <div class="label">🛍️ 物品购置</div>
        <div class="value gold">{{ itemPercent }}%</div>
        <div class="sub">{{ summary.items.purchased }} / {{ summary.items.total }} 件</div>
        <div class="progress mt8"><i :style="{ width: itemPercent + '%' }" /></div>
      </div>
      <div class="stat-card">
        <div class="label">📝 任务完成</div>
        <div class="value">{{ taskPercent }}%</div>
        <div class="sub">{{ summary.tasks.done }} / {{ summary.tasks.total }} 项</div>
        <div class="progress mt8"><i :style="{ width: taskPercent + '%' }" /></div>
      </div>
      <div class="stat-card">
        <div class="label">💌 宾客确认</div>
        <div class="value" style="color: var(--info)">{{ guestPercent }}%</div>
        <div class="sub">{{ summary.guests.confirmedHeads }} / {{ summary.guests.invitedHeads }} 人出席</div>
        <div class="progress mt8"><i :style="{ width: guestPercent + '%' }" /></div>
      </div>
    </div>

    <!-- 近期待办 -->
    <div class="card mt16" v-if="summary">
      <div class="page-head" style="margin-bottom: 12px">
        <h3 class="section-title" style="margin: 0">⏳ 近期待办</h3>
        <router-link to="/tasks" class="badge mute">全部任务 →</router-link>
      </div>
      <div class="list" v-if="summary.upcoming.length">
        <div v-for="t in summary.upcoming" :key="t.id" class="row">
          <input type="checkbox" class="ck" @change="finishTask(t)" />
          <div class="grow">
            <div class="name">{{ t.title }}</div>
            <div class="sub">
              <span v-if="t.due_date">截止 {{ t.due_date }}</span>
              <span v-if="t.assignee"> · {{ t.assignee }}</span>
            </div>
          </div>
          <span class="badge" :class="t.status === 'doing' ? 'warn' : 'mute'">
            {{ t.status === 'doing' ? '进行中' : '待办' }}
          </span>
        </div>
      </div>
      <EmptyState v-else emoji="🎉" text="太棒了，暂无待办任务！" />
    </div>

    <!-- 预算环形概览 -->
    <div class="card mt16 flex-card" v-if="summary && summary.budget.totalBudget > 0">
      <RingChart :percent="budgetPercent" :size="124">
        <div class="num" style="font-size: 22px; font-weight: 800; color: var(--primary-deep)">{{ budgetPercent }}%</div>
        <div class="muted" style="font-size: 11px">预算已用</div>
      </RingChart>
      <div class="grow">
        <div class="kv"><span>总预算</span><b class="num">¥{{ money(summary.budget.totalBudget) }}</b></div>
        <div class="kv"><span>已花费</span><b class="num pink">¥{{ money(summary.budget.totalSpent) }}</b></div>
        <div class="kv"><span>剩余</span><b class="num" :style="{ color: summary.budget.totalBudget - summary.budget.totalSpent >= 0 ? 'var(--success)' : 'var(--danger)' }">¥{{ money(summary.budget.totalBudget - summary.budget.totalSpent) }}</b></div>
        <router-link to="/budget" class="badge mute mt8">查看预算明细 →</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: var(--grad-hero);
  padding: 24px 26px;
}
.hero-names { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
.hero-line { font-size: 13.5px; margin-top: 6px; color: var(--secondary); font-weight: 500; }
.hero-count { text-align: center; }
.hero-count .n { font-size: 52px; font-weight: 800; color: var(--primary-deep); font-family: Georgia, serif; line-height: 1.1; }
.hero-count .t { font-size: 12.5px; color: var(--secondary); font-weight: 600; }
@media (max-width: 480px) {
  .hero { flex-direction: column; text-align: center; padding: 22px 18px; }
  .hero-names { font-size: 19px; }
  .hero-count .n { font-size: 44px; }
}
.flex-card { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.flex-card .grow { flex: 1; min-width: 220px; }
.kv { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; border-bottom: 1px dashed var(--line); }
.kv:last-of-type { border-bottom: none; }
.kv span { color: var(--muted); }
</style>
