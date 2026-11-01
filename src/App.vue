<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from './stores/app'
import { NAV_ITEMS, TAB_ITEMS } from './router'
import { applyTheme, currentTheme, THEME_LABEL, THEME_ORDER, type ThemeName } from './theme'

const store = useAppStore()
const route = useRoute()

store.loadSettings().catch(() => {})

const theme = ref<ThemeName>(currentTheme())
function toggleTheme() {
  const i = THEME_ORDER.indexOf(theme.value)
  theme.value = THEME_ORDER[(i + 1) % THEME_ORDER.length]
  applyTheme(theme.value)
}

const pageTitle = computed(() => route.meta.title as string)
const countdown = computed(() => store.countdownDays)
const countdownText = computed(() => {
  if (countdown.value === null) return '婚期待定'
  if (countdown.value > 0) return `倒数 ${countdown.value} 天`
  if (countdown.value === 0) return '今天大喜 🎉'
  return '新婚快乐'
})
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-emoji">💒</div>
      <div>
        <div class="brand-name">备婚计划</div>
        <div class="brand-sub">{{ store.coupleText }}</div>
      </div>
    </div>
    <nav class="nav">
      <router-link v-for="it in NAV_ITEMS" :key="it.path" :to="it.path" class="nav-item">
        <span class="ico">{{ it.icon }}</span>{{ it.title }}
      </router-link>
    </nav>
    <div class="side-countdown" v-if="countdown !== null">
      <div class="n">{{ Math.abs(countdown) }}</div>
      <div class="t">{{ countdown >= 0 ? '距婚礼还有（天）' : '婚礼已过（天）' }}</div>
    </div>
    <router-link to="/settings" class="side-countdown" v-else style="display:block">
      <div class="n" style="font-size:20px">📅</div>
      <div class="t">婚期待定 · 点击设置</div>
    </router-link>
    <button class="theme-btn" @click="toggleTheme">🎨 主题：{{ THEME_LABEL[theme] }}</button>
  </aside>

  <div class="topbar">
    <div class="title"><span>💒</span>{{ pageTitle }}</div>
    <div class="topbar-right">
      <router-link to="/settings" class="countdown-chip">{{ countdownText }}</router-link>
      <button class="theme-chip" title="切换主题" @click="toggleTheme">🎨</button>
    </div>
  </div>

  <main class="main">
    <div class="main-inner">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </div>
  </main>

  <nav class="tabbar">
    <router-link v-for="it in TAB_ITEMS" :key="it.path" :to="it.path">
      <span class="ico">{{ it.icon }}</span>{{ it.title }}
    </router-link>
  </nav>
</template>
