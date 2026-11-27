<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

function switchMode(m: 'login' | 'register') {
  mode.value = m
  error.value = ''
  password.value = ''
  confirm.value = ''
}

async function submit() {
  if (loading.value) return
  error.value = ''
  if (!username.value.trim() || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  if (mode.value === 'register' && password.value !== confirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const target = typeof route.query.redirect === 'string'
      && route.query.redirect.startsWith('/')
      && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/'
    if (mode.value === 'register') {
      await auth.register(username.value.trim(), password.value)
      router.replace('/welcome')
    } else {
      const user = await auth.login(username.value.trim(), password.value)
      router.replace(user.onboarded ? target : '/welcome')
    }
  } catch (e: any) {
    error.value = e.message || (mode.value === 'register' ? '注册失败，请稍后再试' : '登录失败，请稍后再试')
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
      <p class="sub muted">{{ mode === 'login' ? '登录后继续筹备你们的婚礼' : '注册一个账号，开始你们的备婚计划' }}</p>

      <form @submit.prevent="submit">
        <div class="field">
          <label>账号名称</label>
          <input
            class="input"
            v-model.trim="username"
            autocomplete="username"
            maxlength="24"
            placeholder="支持中文，2-24 个字符"
          />
        </div>
        <div class="field">
          <label>密码</label>
          <input
            class="input"
            type="password"
            v-model="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            placeholder="请输入密码"
          />
        </div>
        <div class="field" v-if="mode === 'register'">
          <label>确认密码</label>
          <input
            class="input"
            type="password"
            v-model="confirm"
            autocomplete="new-password"
            placeholder="再次输入密码"
          />
        </div>
        <p class="err" v-if="error">{{ error }}</p>
        <button class="btn btn-primary login-btn" type="submit" :disabled="loading">
          {{ loading ? (mode === 'register' ? '注册中…' : '登录中…') : (mode === 'register' ? '注册并登录' : '登录') }}
        </button>
      </form>

      <button class="link-btn" type="button" @click="switchMode(mode === 'login' ? 'register' : 'login')">
        {{ mode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录' }}
      </button>
      <p class="hint muted">{{ mode === 'login' ? '支持多人、多台设备同时登录同一账号' : '密码长度不限；注册后可设置姓名、婚期等信息' }}</p>
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
.link-btn {
  margin-top: 14px; border: none; background: transparent; cursor: pointer;
  font-size: 13px; font-weight: 600; color: var(--primary-deep);
}
.link-btn:hover { text-decoration: underline; }
.hint { font-size: 12px; margin-top: 10px; }
</style>
