<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const form = reactive({
  groom_name: '',
  bride_name: '',
  wedding_date: '',
  venue: '',
  total_budget: 0
})
const loading = ref(false)
const error = ref('')

async function save() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.completeOnboarding({ settings: { ...form, total_budget: Number(form.total_budget) || 0 } })
    router.replace('/')
  } catch (e: any) {
    error.value = e.message || '保存失败，请稍后再试'
  } finally {
    loading.value = false
  }
}

async function skip() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.completeOnboarding({ skip: true })
    router.replace('/')
  } catch (e: any) {
    error.value = e.message || '操作失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="onboard-page">
    <div class="card onboard-card">
      <div class="head">
        <div class="logo">💍</div>
        <h1>欢迎来到备婚计划</h1>
        <p class="sub muted">先做几个基础设置，之后随时可以在「设置」里修改</p>
      </div>

      <form @submit.prevent="save">
        <div class="form-grid">
          <div class="field">
            <label>新郎姓名</label>
            <input class="input" v-model="form.groom_name" placeholder="新郎的名字" />
          </div>
          <div class="field">
            <label>新娘姓名</label>
            <input class="input" v-model="form.bride_name" placeholder="新娘的名字" />
          </div>
          <div class="field">
            <label>婚礼日期（可待定）</label>
            <input class="input" type="date" v-model="form.wedding_date" />
          </div>
          <div class="field">
            <label>婚礼场地（选填）</label>
            <input class="input" v-model="form.venue" placeholder="如：幸福大酒店 · 宴会厅" />
          </div>
          <div class="field full">
            <label>总预算（元，选填）</label>
            <input class="input" type="number" min="0" step="1000" v-model.number="form.total_budget" placeholder="如：130000" />
          </div>
        </div>

        <p class="err" v-if="error">{{ error }}</p>
        <div class="ops">
          <button class="btn btn-primary" type="submit" :disabled="loading">{{ loading ? '保存中…' : '保存并开始' }}</button>
          <button class="btn" type="button" :disabled="loading" @click="skip">暂时跳过</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.onboard-page {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 18px calc(24px + env(safe-area-inset-bottom));
  background: var(--grad-hero);
}
.onboard-card { width: 100%; max-width: 560px; padding: 28px 26px; }
.head { text-align: center; margin-bottom: 22px; }
.logo { font-size: 42px; line-height: 1; }
h1 { font-size: 21px; font-weight: 800; margin: 10px 0 0; }
.sub { font-size: 13px; margin-top: 6px; line-height: 1.6; }
.err { color: var(--danger); font-size: 13px; margin: 10px 0 0; }
.ops { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
</style>
