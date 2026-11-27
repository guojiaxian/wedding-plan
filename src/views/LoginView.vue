<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('admin')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (loading.value) return
  error.value = ''
  if (!username.value.trim() || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  loading.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    const target = typeof route.query.redirect === 'string'
      && route.query.redirect.startsWith('/')
      && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/'
    router.replace(target)
  } catch (e: any) {
    error.value = e.message || '登录失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="card login-card">
      <div class="logo">💒</div>
      <h1>备婚计划</h1>
      <p class="sub muted">登录后继续筹备你们的婚礼</p>

      <form @submit.prevent="submit">
        <div class="field">
          <label>账号</label>
          <input
            class="input"
            v-model.trim="username"
            autocomplete="username"
            placeholder="请输入账号"
          />
        </div>
        <div class="field">
          <label>密码</label>
          <input
            class="input"
            type="password"
            v-model="password"
            autocomplete="current-password"
            placeholder="请输入密码"
          />
        </div>
        <p class="err" v-if="error">{{ error }}</p>
        <button class="btn btn-primary login-btn" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <p class="hint muted">支持多人、多台设备同时登录同一账号</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 18px calc(24px + env(safe-area-inset-bottom));
  background: var(--grad-hero);
}
.login-card {
  width: 100%; max-width: 372px;
  padding: 30px 26px 22px;
  text-align: center;
}
.logo { font-size: 46px; line-height: 1; }
h1 { font-size: 22px; font-weight: 800; margin: 10px 0 0; letter-spacing: 1px; }
.sub { font-size: 13px; margin-top: 6px; }
form { margin-top: 24px; text-align: left; display: flex; flex-direction: column; gap: 14px; }
.login-btn { width: 100%; height: 42px; margin-top: 2px; }
.err { color: var(--danger); font-size: 13px; margin: -2px 0 0; }
.hint { font-size: 12px; margin-top: 18px; }
</style>
