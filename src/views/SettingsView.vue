<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, toast } from '../api/client'
import { useAppStore } from '../stores/app'
import { useAuthStore } from '../stores/auth'
import { applyTheme, currentTheme, THEME_LABEL, type ThemeName } from '../theme'

const store = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const theme = ref<ThemeName>(currentTheme())

const THEMES: { key: ThemeName; desc: string; swatches: string[] }[] = [
  { key: 'minimal', desc: '白 + 橄榄绿 · 清爽现代工具风', swatches: ['#8FA382', '#C9ADA7', '#FAFAF7'] },
  { key: 'ivory', desc: '象牙白 + 尤加利绿 + 香槟金 · 西式花园风', swatches: ['#C6B08F', '#A3B39B', '#FCFBF7'] },
  { key: 'romance', desc: '粉 + 香槟金 · 典雅浪漫风', swatches: ['#E8A0BF', '#D4A574', '#FFF5F7'] }
]

function pickTheme(t: ThemeName) {
  theme.value = t
  applyTheme(t)
  toast(`已切换为「${THEME_LABEL[t]}」主题`)
}
const form = reactive({
  groom_name: '', bride_name: '', wedding_date: '', venue: '', total_budget: 0
})
const weddingTbd = ref(false) // 婚期待定：清空日期并以标记显示
const saving = ref(false)
const importing = ref(false)
const fileInput = ref<HTMLInputElement>()

onMounted(() => {
  store.loadSettings(true).then(() => {
    const s = store.settings!
    Object.assign(form, {
      groom_name: s.groom_name, bride_name: s.bride_name,
      wedding_date: s.wedding_date, venue: s.venue,
      total_budget: Number(s.total_budget) || 0
    })
    weddingTbd.value = !s.wedding_date
  }).catch((e: any) => toast(e.message, 'err'))
})

function toggleWeddingTbd(v: boolean) {
  weddingTbd.value = v
  if (v) form.wedding_date = ''
}

async function save() {
  saving.value = true
  try {
    await store.saveSettings({ ...form, wedding_date: weddingTbd.value ? '' : form.wedding_date, total_budget: Number(form.total_budget) || 0 })
    toast('已保存 ✓')
  } catch (e: any) { toast(e.message, 'err') }
  saving.value = false
}

function exportData() {
  window.open('/api/backup', '_blank')
  toast('备份文件已开始下载')
}

function pickImport() { fileInput.value?.click() }

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!confirm('导入备份将覆盖当前全部数据，确定继续吗？')) return
  importing.value = true
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    await api.post('/backup', data)
    toast('导入成功，即将刷新')
    setTimeout(() => location.reload(), 800)
  } catch (e: any) { toast(e.message || '导入失败', 'err') }
  importing.value = false
}

async function resetTemplate() {
  if (!confirm('将清空全部数据并重新载入备婚模板，确定继续吗？')) return
  try {
    await api.post('/seed/reset')
    toast('已重置为模板数据，即将刷新')
    setTimeout(() => location.reload(), 800)
  } catch (e: any) { toast(e.message, 'err') }
}

async function clearAll() {
  if (!confirm('将清空除婚礼信息外的全部数据（不可恢复），确定继续吗？')) return
  try {
    await api.post('/seed/clear')
    toast('已清空数据')
    setTimeout(() => location.reload(), 800)
  } catch (e: any) { toast(e.message, 'err') }
}

// ---------- 账号安全 ----------
const pwd = reactive({ old: '', next: '', confirm: '' })
const changing = ref(false)
const username = ref(auth.user?.username || '')
const savingName = ref(false)
watch(() => auth.user?.username, v => { username.value = v || '' })

async function saveUsername() {
  const name = username.value.trim()
  if (!name || name === auth.user?.username) return
  if (name.length < 2 || name.length > 24) return toast('账号名称需为 2-24 个字符', 'err')
  savingName.value = true
  try {
    await auth.updateUsername(name)
    username.value = name
    localStorage.setItem('wp_last_username', name)
    toast('账号名称已更新 ✓')
  } catch (e: any) { toast(e.message, 'err') }
  savingName.value = false
}

async function changePassword() {
  if (changing.value) return
  if (!pwd.old || !pwd.next) return toast('请填写当前密码和新密码', 'err')
  if (pwd.next.length < 6) return toast('新密码至少 6 位', 'err')
  if (pwd.next !== pwd.confirm) return toast('两次输入的新密码不一致', 'err')
  changing.value = true
  try {
    await api.post('/auth/password', { oldPassword: pwd.old, newPassword: pwd.next })
    pwd.old = pwd.next = pwd.confirm = ''
    toast('密码已修改 ✓')
  } catch (e: any) { toast(e.message, 'err') }
  changing.value = false
}

async function logout() {
  await auth.logout()
  toast('已退出登录')
  router.replace('/login')
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">⚙️</span>婚礼设置</h2>
    </div>

    <div class="card">
      <h3 class="section-title" style="margin-top:0">💒 婚礼信息</h3>
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
          <label>婚礼日期</label>
          <div class="date-row">
            <input class="input" type="date" v-model="form.wedding_date" :disabled="weddingTbd" />
            <label class="tbd-toggle">
              <input type="checkbox" class="ck" :checked="weddingTbd" @change="toggleWeddingTbd(($event.target as HTMLInputElement).checked)" /> 待定
            </label>
          </div>
        </div>
        <div class="field">
          <label>婚礼场地</label>
          <input class="input" v-model="form.venue" placeholder="如：幸福大酒店 · 宴会厅" />
        </div>
        <div class="field full">
          <label>总预算（元）</label>
          <input class="input" type="number" min="0" step="1000" v-model.number="form.total_budget" />
        </div>
      </div>
      <div class="mt16">
        <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button>
      </div>
    </div>

    <div class="card mt16">
      <h3 class="section-title" style="margin-top:0">🎨 外观主题</h3>
      <div class="theme-grid">
        <button v-for="t in THEMES" :key="t.key" class="theme-card" :class="{ active: theme === t.key }" @click="pickTheme(t.key)">
          <div class="sw-row">
            <span v-for="c in t.swatches" :key="c" class="sw" :style="{ background: c }"></span>
          </div>
          <div class="tt">{{ THEME_LABEL[t.key] }} <span v-if="theme === t.key" class="badge ok">使用中</span></div>
          <div class="td muted">{{ t.desc }}</div>
        </button>
      </div>
    </div>

    <div class="card mt16">
      <h3 class="section-title" style="margin-top:0">🔐 账号安全</h3>
      <p class="muted" style="font-size: 13.5px">
        支持多台设备同时登录；修改密码不会影响其他已登录设备。
      </p>
      <div class="form-grid mt16">
        <div class="field full">
          <label>账号名称</label>
          <div class="name-row">
            <input class="input" v-model.trim="username" maxlength="24" autocomplete="username" placeholder="2-24 个字符" />
            <button class="btn" :disabled="savingName || !username.trim() || username.trim() === auth.user?.username" @click="saveUsername">
              {{ savingName ? '保存中…' : '保存名称' }}
            </button>
          </div>
        </div>
        <div class="field">
          <label>当前密码</label>
          <input class="input" type="password" v-model="pwd.old" autocomplete="current-password" placeholder="请输入当前密码" />
        </div>
        <div class="field">
          <label>新密码（6-64 位）</label>
          <input class="input" type="password" v-model="pwd.next" autocomplete="new-password" placeholder="请输入新密码" />
        </div>
        <div class="field full">
          <label>确认新密码</label>
          <input class="input" type="password" v-model="pwd.confirm" autocomplete="new-password" placeholder="再次输入新密码" />
        </div>
      </div>
      <div class="acct-ops">
        <button class="btn btn-primary" :disabled="changing" @click="changePassword">{{ changing ? '修改中…' : '修改密码' }}</button>
        <button class="btn btn-danger-ghost" @click="logout">退出登录</button>
      </div>
    </div>

    <div class="card mt16">
      <h3 class="section-title" style="margin-top:0">🗄️ 数据管理</h3>
      <p class="muted" style="font-size: 13.5px">
        数据保存在本机数据库中。建议定期导出 JSON 备份，可在其他设备导入恢复，或用于更换电脑时迁移。
      </p>
      <div class="data-ops">
        <button class="btn" @click="exportData">⬇️ 导出备份</button>
        <button class="btn" :disabled="importing" @click="pickImport">{{ importing ? '导入中…' : '⬆️ 导入备份' }}</button>
        <input ref="fileInput" type="file" accept="application/json,.json" style="display:none" @change="onImportFile" />
        <button class="btn btn-gold" @click="resetTemplate">🎁 重置为备婚模板</button>
        <button class="btn btn-danger-ghost" @click="clearAll">🧹 清空数据</button>
      </div>
    </div>

    <div class="card mt16">
      <h3 class="section-title" style="margin-top:0">💕 关于</h3>
      <p class="muted" style="font-size: 13.5px; line-height: 1.9">
        「备婚计划」— 新人的专属备婚工具：花销规划 · 物品清单 · 筹备任务 · 婚礼流程 · 现场布置 · 人员分工 · 宾客名单。<br />
        祝有情人终成眷属，婚礼圆满顺利！🎈
      </p>
    </div>
  </div>
</template>

<style scoped>
.data-ops { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.acct-ops { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.name-row { display: flex; gap: 8px; }
.name-row .input { flex: 1; min-width: 0; }
.name-row .btn { flex-shrink: 0; }
.theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 14px; }
@media (max-width: 480px) { .theme-grid { grid-template-columns: 1fr; } }
.theme-card {
  text-align: left; border: 1.5px solid var(--line); background: #fff;
  border-radius: var(--radius-sm); padding: 14px; cursor: pointer; transition: all .15s;
}
.theme-card:hover { border-color: var(--primary); }
.theme-card.active { border-color: var(--primary-deep); box-shadow: 0 0 0 2px var(--primary-soft); }
.sw-row { display: flex; gap: 6px; margin-bottom: 10px; }
.sw { width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(0,0,0,.06); }
.tt { font-weight: 700; font-size: 14.5px; display: flex; align-items: center; gap: 6px; }
.td { font-size: 12.5px; margin-top: 3px; }
</style>
