<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { NAV_ITEMS, TAB_ROWS } from './router'
import { api, toast } from './api/client'
import UiModal from './components/UiModal.vue'
import { applyTheme, currentTheme, THEME_LABEL, THEME_ORDER, type ThemeName } from './theme'

const store = useAppStore()
const auth = useAuthStore()
const route = useRoute()

const isBlank = computed(() => !!route.meta.blank)

// 登录后加载婚礼信息（登录页不请求受保护接口）
watch([() => auth.user, isBlank], ([user, blank]) => {
  if (user && !blank) store.loadSettings().catch(() => {})
}, { immediate: true })

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

// ---------- 只读分享链接 ----------
const shareOpen = ref(false)
const shareLink = ref('')
const shareLoading = ref(false)
const shareInput = ref<HTMLInputElement>()

async function openShare() {
  shareOpen.value = true
  if (shareLink.value) return
  shareLoading.value = true
  try {
    const r = await api.get<{ token: string }>('/share-link')
    shareLink.value = `${location.origin}/share/${r.token}`
  } catch (e: any) {
    toast(e.message, 'err')
    shareOpen.value = false
  } finally {
    shareLoading.value = false
  }
}

async function copyShare() {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value)
    toast('分享链接已复制 ✓')
  } catch {
    try {
      shareInput.value?.select()
      document.execCommand('copy')
      toast('分享链接已复制 ✓')
    } catch {
      toast('复制失败，请长按链接手动复制', 'err')
    }
  }
}
</script>

<template>
  <aside class="sidebar" v-if="!isBlank">
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
    <button class="theme-btn" @click="openShare">🔗 分享给家人</button>
    <button class="theme-btn" @click="toggleTheme">🎨 主题：{{ THEME_LABEL[theme] }}</button>
  </aside>

  <div class="topbar" v-if="!isBlank">
    <div class="title"><span>💒</span>{{ pageTitle }}</div>
    <div class="topbar-right">
      <router-link to="/settings" class="countdown-chip">{{ countdownText }}</router-link>
      <button class="theme-chip" title="分享只读链接" @click="openShare">🔗</button>
      <button class="theme-chip" title="切换主题" @click="toggleTheme">🎨</button>
    </div>
  </div>

  <main class="main" :class="{ 'main-blank': isBlank }">
    <div class="main-inner">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </div>
  </main>

  <nav class="tabbar" v-if="!isBlank">
    <div class="tab-row" v-for="(row, ri) in TAB_ROWS" :key="ri">
      <router-link v-for="it in row" :key="it.path" :to="it.path">
        <span class="ico">{{ it.icon }}</span>{{ it.title }}
      </router-link>
    </div>
  </nav>

  <UiModal :open="shareOpen" title="分享备婚计划" @close="shareOpen = false">
    <p class="share-tip muted">拿到链接的人<b>无需登录</b>即可查看全部备婚数据，页面只读、无法修改。请只分享给信任的家人。</p>
    <div v-if="shareLoading" class="muted">正在生成链接…</div>
    <input
      v-else
      ref="shareInput"
      class="input share-link"
      :value="shareLink"
      readonly
      @focus="($event.target as HTMLInputElement).select()"
    />
    <template #footer>
      <button class="btn" @click="shareOpen = false">关闭</button>
      <button class="btn btn-primary" :disabled="!shareLink" @click="copyShare">复制链接</button>
    </template>
  </UiModal>
</template>

<style scoped>
.share-tip { font-size: 13px; line-height: 1.7; margin-bottom: 12px; }
.share-link { font-size: 12.5px; color: var(--secondary); }
</style>
