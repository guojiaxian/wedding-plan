<script setup lang="ts">
import { useAppStore } from '../stores/app'
import { NAV_ITEMS } from '../router'

const store = useAppStore()

// 「更多」页收纳除首页/预算/清单/流程外的模块
const MORE_PATHS = ['/tasks', '/decorations', '/staff', '/guests', '/settings']
const cards = NAV_ITEMS.filter(it => MORE_PATHS.includes(it.path))
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">🗂️</span>更多功能</h2>
    </div>
    <p class="muted mb16" style="font-size: 13.5px">{{ store.coupleText }} · 备婚进行时，加油！💪</p>
    <div class="more-grid">
      <router-link v-for="c in cards" :key="c.path" :to="c.path" class="card more-card">
        <div class="mi">{{ c.icon }}</div>
        <div>
          <div class="mt">{{ c.title }}</div>
          <div class="md muted">{{ ({
            '/tasks': '按时间阶段推进备婚事项',
            '/decorations': '五大区域布置清单',
            '/staff': '婚礼当天工作人员分工',
            '/guests': '邀请、出席与桌位管理',
            '/settings': '婚礼信息与数据备份'
          } as Record<string, string>)[c.path] }}</div>
        </div>
        <span class="arr muted">›</span>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.more-grid { display: flex; flex-direction: column; gap: 10px; }
.more-card {
  display: flex; align-items: center; gap: 14px; padding: 16px 18px;
  transition: transform .15s;
}
.more-card:hover { transform: translateY(-2px); }
.mi {
  width: 46px; height: 46px; border-radius: 14px; font-size: 23px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--primary-soft), #FDF0E4);
  display: flex; align-items: center; justify-content: center;
}
.mt { font-weight: 700; font-size: 15px; }
.md { font-size: 12.5px; margin-top: 2px; }
.arr { margin-left: auto; font-size: 22px; }
</style>
