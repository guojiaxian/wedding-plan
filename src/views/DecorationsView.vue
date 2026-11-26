<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { api, toast } from '../api/client'
import type { Decoration, DecorationImage } from '../api/types'
import UiModal from '../components/UiModal.vue'
import EmptyState from '../components/EmptyState.vue'
import SeatMap from '../components/SeatMap.vue'

const tab = ref<'list' | 'seats'>('list')

const AREAS = [
  { key: 'welcome', label: '迎宾区', icon: '🙋' },
  { key: 'sign', label: '签到区', icon: '✍️' },
  { key: 'banquet', label: '宴会厅', icon: '🍽️' },
  { key: 'home', label: '婚房', icon: '🏠' }
]

const decorations = ref<Decoration[]>([])
const loading = ref(true)
const collapsed = ref<Record<string, boolean>>({})

async function load() {
  try { decorations.value = await api.get<Decoration[]>('/decorations') }
  catch (e: any) { toast(e.message, 'err') }
  loading.value = false
}
onMounted(load)

const grouped = computed(() => AREAS.map(a => ({
  ...a,
  list: decorations.value.filter(d => d.area === a.key)
})).filter(g => g.list.length))

const stats = computed(() => ({
  total: decorations.value.length,
  done: decorations.value.filter(d => d.done).length
}))
const areaDone = (key: string) => decorations.value.filter(d => d.area === key && d.done).length
const areaTotal = (key: string) => decorations.value.filter(d => d.area === key).length

async function toggle(d: Decoration) {
  try {
    d.done = d.done ? 0 : 1
    await api.put(`/decorations/${d.id}`, { done: d.done })
  } catch (e: any) { toast(e.message, 'err'); load() }
}

const modal = ref(false)
const form = reactive({ id: 0, area: 'welcome', name: '', done: false, source: '', note: '' })

function openNew(area: string) {
  Object.assign(form, { id: 0, area, name: '', done: false, source: '', note: '' })
  modal.value = true
}
function openEdit(d: Decoration) {
  Object.assign(form, { id: d.id, area: d.area, name: d.name, done: !!d.done, source: d.source, note: d.note })
  modal.value = true
}
async function save() {
  if (!form.name.trim()) return toast('请填写布置项', 'err')
  try {
    const body = { area: form.area, name: form.name, done: form.done ? 1 : 0, source: form.source, note: form.note }
    if (form.id) await api.put(`/decorations/${form.id}`, body)
    else await api.post('/decorations', body)
    modal.value = false
    toast('已保存 ✓')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}
async function remove(d: Decoration) {
  if (!confirm(`删除布置项「${d.name}」？`)) return
  try {
    await api.del(`/decorations/${d.id}`)
    toast('已删除')
    load()
  } catch (e: any) { toast(e.message, 'err') }
}

// ---------- 参考图 ----------
const gallery = ref(false)
const galleryItem = ref<Decoration | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadDone = ref(0)
const uploadTotal = ref(0)

const galImages = computed(() => galleryItem.value?.images || [])

function openGallery(d: Decoration) {
  galleryItem.value = d
  lightbox.value = false
  gallery.value = true
}

// 行内缩略图：点图直接看大图（管理上传/删除仍走 📷 图库）
function openLightboxAt(d: Decoration, i: number) {
  galleryItem.value = d
  viewImage(i)
}
function closeGallery() {
  gallery.value = false
  lightbox.value = false
}

// 前端压缩：参考图多为手机照片/截图，压成 JPEG 控制传输与库体积（原图 1600px，列表缩略图 400px）
function readScaled(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d')
      if (!ctx) return reject(new Error('图片处理失败'))
      ctx.fillStyle = '#fff' // 透明 PNG 转 JPEG 时垫白底
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      cv.toBlob(b => {
        if (!b) return reject(new Error('图片处理失败'))
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('图片读取失败'))
        r.readAsDataURL(b)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法识别，请换一张试试')) }
    img.src = url
  })
}

async function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  await uploadFiles(files)
}

// 统一上传入口：文件选择、Ctrl+V 粘贴、拖拽都走这里
async function uploadFiles(files: File[]) {
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length || !galleryItem.value) return
  if (imgs.length < files.length) toast('已忽略非图片文件', 'err')
  uploading.value = true
  uploadDone.value = 0
  uploadTotal.value = imgs.length
  let ok = 0
  for (const f of imgs) {
    try {
      const [data, thumb] = await Promise.all([readScaled(f, 1600, 0.85), readScaled(f, 400, 0.7)])
      await api.post('/decoration-images', { decoration_id: galleryItem.value.id, name: f.name, thumb, data })
      ok++
    } catch (err: any) { toast(`${f.name}：${err.message}`, 'err') }
    uploadDone.value++
  }
  uploading.value = false
  if (ok) { toast(`已添加 ${ok} 张参考图 ✓`); await refreshGallery() }
}

// 图库打开时 Ctrl+V 直接粘贴截图/复制的图片
function onPaste(e: ClipboardEvent) {
  if (!gallery.value || uploading.value) return
  const files: File[] = []
  for (const item of Array.from(e.clipboardData?.items || [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  if (files.length) { e.preventDefault(); uploadFiles(files) }
}

// 拖拽图片到弹窗上传（拦截在弹窗层，避免浏览器默认打开图片文件）
const dragging = ref(false)
function onDragOver(e: DragEvent) {
  if (!gallery.value) return
  e.preventDefault()
  if (e.dataTransfer?.types?.includes('Files')) dragging.value = true
}
function onDragLeave(e: DragEvent) {
  const el = e.currentTarget as HTMLElement
  if (!(e.relatedTarget && el?.contains(e.relatedTarget as Node))) dragging.value = false
}
function onDrop(e: DragEvent) {
  dragging.value = false
  if (!gallery.value || uploading.value) return
  e.preventDefault()
  uploadFiles(Array.from(e.dataTransfer?.files || []))
}

// 重新拉取清单并同步当前图库（列表缩略图、行内数量一并刷新）
async function refreshGallery() {
  if (!galleryItem.value) return
  try {
    const all = await api.get<Decoration[]>('/decorations')
    decorations.value = all
    const cur = all.find(x => x.id === galleryItem.value!.id)
    if (cur) galleryItem.value = cur
  } catch (e: any) { toast(e.message, 'err') }
}

async function removeImage(im: DecorationImage | undefined) {
  if (!im || !confirm('删除这张参考图？')) return
  const inLightbox = lightbox.value
  const idx = galImages.value.findIndex(x => x.id === im.id)
  try {
    await api.del(`/decoration-images/${im.id}`)
    await refreshGallery()
    toast('已删除')
    if (inLightbox) {
      const n = galImages.value.length
      if (!n) lightbox.value = false
      else viewImage(Math.min(Math.max(idx, 0), n - 1))
    }
  } catch (e: any) { toast(e.message, 'err') }
}

// ---------- 大图灯箱 ----------
const lightbox = ref(false)
const lightboxIdx = ref(0)
const lightboxSrc = ref('')
const lightboxLoading = ref(false)
let viewToken = 0

async function viewImage(i: number) {
  const im = galImages.value[i]
  if (!im) return
  const token = ++viewToken
  lightbox.value = true
  lightboxIdx.value = i
  lightboxSrc.value = im.thumb // 先以缩略图占位，原图到达后替换
  lightboxLoading.value = true
  try {
    const full = await api.get<{ data: string }>(`/decoration-images/${im.id}`)
    if (token !== viewToken) return // 已切到其他图，丢弃过期响应
    lightboxSrc.value = full.data
  } catch (e: any) { toast(e.message, 'err') }
  if (token === viewToken) lightboxLoading.value = false
}

function step(dir: number) {
  const n = galImages.value.length
  if (n) viewImage((lightboxIdx.value + dir + n) % n)
}

function onKey(e: KeyboardEvent) {
  if (!lightbox.value) return
  if (e.key === 'Escape') lightbox.value = false
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key === 'ArrowRight') step(1)
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('paste', onPaste)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('paste', onPaste)
})
</script>

<template>
  <div>
    <div class="page-head">
      <h2 class="page-title"><span class="ico">🎀</span>现场布置</h2>
      <div class="page-actions">
        <button class="btn" @click="openNew('welcome')">＋ 添加布置项</button>
      </div>
    </div>

    <div class="chip-row mb16">
      <button class="chip" :class="{ active: tab === 'list' }" @click="tab = 'list'">🎀 布置清单</button>
      <button class="chip" :class="{ active: tab === 'seats' }" @click="tab = 'seats'">🪑 座位排布</button>
    </div>

    <template v-if="tab === 'list'">
    <div class="card stat-line">
      <span>共 <b class="num">{{ stats.total }}</b> 项</span>
      <span>已就绪 <b class="num" style="color: var(--success)">{{ stats.done }}</b> 项</span>
      <span class="progress" style="flex:1; min-width: 120px" v-if="stats.total">
        <i :style="{ width: Math.round(stats.done / stats.total * 100) + '%' }" />
      </span>
    </div>

    <div v-if="!loading && !grouped.length" class="mt16">
      <EmptyState emoji="🎀" text="还没有布置清单，从迎宾区或签到区开始规划吧" />
    </div>

    <div v-for="g in grouped" :key="g.key" class="card group-card">
      <div class="group-head" @click="collapsed[g.key] = !collapsed[g.key]">
        <span class="gi">{{ g.icon }} <b>{{ g.label }}</b></span>
        <span class="muted gs">{{ areaDone(g.key) }}/{{ areaTotal(g.key) }} 就绪</span>
        <span class="arrow" :class="{ up: !collapsed[g.key] }">▾</span>
      </div>
      <div class="list" v-show="!collapsed[g.key]">
        <div v-for="d in g.list" :key="d.id" class="row" :class="{ done: d.done }">
          <input type="checkbox" class="ck" :checked="!!d.done" @change="toggle(d)" />
          <div class="grow">
            <div class="name">
              {{ d.name }}
              <span v-if="d.source" class="badge warn" style="margin-left:6px">{{ d.source }}</span>
            </div>
            <div class="sub" v-if="d.note">{{ d.note }}</div>
            <div class="thumbs" v-if="d.images && d.images.length">
              <button
                v-for="(im, i) in d.images.slice(0, 4)" :key="im.id"
                class="thumb" :style="{ backgroundImage: `url(${im.thumb})` }"
                :title="`${im.name || '参考图'}（点击查看大图）`" @click="openLightboxAt(d, i)"
              />
              <button v-if="d.images.length > 4" class="thumb more" :title="`查看全部 ${d.images.length} 张`" @click="openGallery(d)">
                +{{ d.images.length - 4 }}
              </button>
            </div>
          </div>
          <div class="ops">
            <button class="btn btn-icon" :title="`参考图 ${d.images?.length || 0} 张`" @click="openGallery(d)">📷</button>
            <button class="btn btn-icon" @click="openEdit(d)">✏️</button>
            <button class="btn btn-icon btn-danger-ghost" @click="remove(d)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    </template>

    <SeatMap v-else />

    <UiModal :open="modal" :title="form.id ? '编辑布置项' : '添加布置项'" @close="modal = false">
      <div class="form-grid">
        <div class="field full">
          <label>布置项</label>
          <input class="input" v-model="form.name" placeholder="如：主背景 + 花艺" @keyup.enter="save" />
        </div>
        <div class="field">
          <label>所属区域</label>
          <select class="select" v-model="form.area">
            <option v-for="a in AREAS" :key="a.key" :value="a.key">{{ a.icon }} {{ a.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>来源</label>
          <select class="select" v-model="form.source">
            <option value="">未定</option>
            <option value="婚庆">婚庆</option>
            <option value="自制">自制</option>
            <option value="租赁">租赁</option>
          </select>
        </div>
        <div class="field full" style="justify-content: flex-end">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="ck" v-model="form.done" /> 已就绪
          </label>
        </div>
        <div class="field full">
          <label>备注</label>
          <input class="input" v-model="form.note" placeholder="选填" />
        </div>
        <div class="field full" v-if="form.id">
          <label>参考图</label>
          <div class="sub" style="margin-top:-2px">
            保存后点列表行的 📷 按钮上传（展板设计、花艺配色等参考图）
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="modal = false">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </template>
    </UiModal>

    <!-- 参考图库 -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="gallery" class="g-overlay" @click.self="closeGallery"
             @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
          <div class="g-panel">
            <div class="g-head">
              <h3>📷 参考图 · {{ galleryItem?.name }}</h3>
              <button class="g-close" @click="closeGallery">✕</button>
            </div>
            <div class="g-body" :class="{ drag: dragging }">
              <div v-if="!galImages.length && !uploading" class="g-empty">
                还没有参考图<br />可以上传展板设计、花艺配色、现场布局等参考效果图
              </div>
              <div class="g-grid">
                <div v-for="(im, i) in galImages" :key="im.id" class="g-item">
                  <img :src="im.thumb" :alt="im.name || '参考图'" @click="viewImage(i)" />
                  <button class="g-del" title="删除此图" @click.stop="removeImage(im)">✕</button>
                </div>
                <button class="g-add" :disabled="uploading" @click="fileInput?.click()">
                  <template v-if="!uploading">＋<br />上传图片</template>
                  <template v-else>处理中<br />{{ uploadDone }}/{{ uploadTotal }}</template>
                </button>
              </div>
              <input ref="fileInput" type="file" accept="image/*" multiple class="g-file" @change="onFilesChosen" />
              <p class="g-hint">支持多选、Ctrl+V 粘贴截图、拖拽图片到此处；手机照片会自动压缩后保存</p>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 大图灯箱 -->
    <teleport to="body">
      <transition name="modal">
        <div v-if="lightbox" class="lb-overlay" @click.self="lightbox = false">
          <span v-if="lightboxLoading" class="lb-loading">加载中…</span>
          <button class="lb-close" @click="lightbox = false">✕</button>
          <button v-if="galImages.length > 1" class="lb-nav prev" @click="step(-1)">‹</button>
          <div class="lb-stage" @click.self="lightbox = false">
            <img v-if="lightboxSrc" :src="lightboxSrc" alt="参考图大图" />
          </div>
          <button v-if="galImages.length > 1" class="lb-nav next" @click="step(1)">›</button>
          <div class="lb-foot">
            <span class="lb-cap">{{ galleryItem?.name }} · {{ lightboxIdx + 1 }}/{{ galImages.length }}</span>
            <button class="lb-del" @click="removeImage(galImages[lightboxIdx])">🗑️ 删除此图</button>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style scoped>
.stat-line { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; font-size: 13.5px; color: var(--secondary); margin-bottom: 12px; }
.group-card { margin-bottom: 12px; padding: 14px 18px; }
.group-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.group-head .gi { font-size: 15px; }
.group-head .gs { font-size: 12.5px; flex: 1; text-align: right; }
.arrow { transition: transform .2s; color: var(--muted); }
.arrow.up { transform: rotate(180deg); }
.group-card .list { margin-top: 10px; }

/* ---------- 行内参考图缩略条 ---------- */
.thumbs { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.thumb {
  width: 46px; height: 46px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm);
  background-size: cover; background-position: center; background-color: var(--primary-soft); cursor: pointer;
}
.thumb:hover { border-color: var(--primary); }
.thumb.more {
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 600; color: var(--muted); background: var(--primary-soft);
}

/* ---------- 参考图库弹窗 ---------- */
.g-overlay {
  position: fixed; inset: 0; z-index: 100; background: rgba(74, 59, 66, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.g-panel {
  background: var(--card); border-radius: 18px; width: 100%; max-width: 620px; max-height: 86vh;
  display: flex; flex-direction: column; box-shadow: var(--shadow-lg); overflow: hidden;
}
.g-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px; border-bottom: 1px solid var(--line);
}
.g-head h3 { font-size: 16px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-close {
  border: none; background: var(--primary-soft); color: var(--secondary);
  width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 13px; flex-shrink: 0; margin-left: 10px;
}
.g-close:hover { background: var(--primary); color: #fff; }
.g-body { padding: 16px 20px 18px; overflow-y: auto; transition: box-shadow .15s, background .15s; }
.g-body.drag { background: var(--primary-soft); box-shadow: inset 0 0 0 2px var(--primary); }
.g-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
.g-item { position: relative; aspect-ratio: 1; }
.g-item img {
  width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm);
  border: 1px solid var(--line); cursor: zoom-in; display: block;
}
.g-del {
  position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; border: none; border-radius: 50%;
  background: rgba(255, 255, 255, 0.92); color: var(--danger); font-size: 11px; line-height: 1;
  cursor: pointer; box-shadow: var(--shadow); display: flex; align-items: center; justify-content: center;
}
.g-del:hover { background: var(--danger); color: #fff; }
.g-add {
  aspect-ratio: 1; border: 1.5px dashed var(--line); border-radius: var(--radius-sm);
  background: transparent; color: var(--muted); font-size: 12.5px; line-height: 1.6;
  cursor: pointer; display: flex; align-items: center; justify-content: center; text-align: center;
}
.g-add:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-deep); background: var(--primary-soft); }
.g-add:disabled { opacity: .65; cursor: default; }
.g-file { display: none; }
.g-empty { text-align: center; color: var(--muted); font-size: 13px; line-height: 1.9; padding: 12px 0 6px; }
.g-hint { font-size: 12px; color: var(--muted); margin: 12px 2px 0; }

/* ---------- 大图灯箱 ---------- */
.lb-overlay {
  position: fixed; inset: 0; z-index: 120; background: rgba(32, 30, 27, 0.86);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 52px 60px 24px;
}
.lb-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.lb-stage img {
  max-width: 100%; max-height: 74vh; border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, .45); display: block;
}
.lb-close {
  position: absolute; top: 16px; right: 18px; width: 34px; height: 34px;
  border: none; border-radius: 50%; background: rgba(255, 255, 255, .14); color: #fff;
  font-size: 15px; cursor: pointer;
}
.lb-close:hover { background: rgba(255, 255, 255, .28); }
.lb-nav {
  position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px;
  border: none; border-radius: 50%; background: rgba(255, 255, 255, .14); color: #fff;
  font-size: 22px; line-height: 1; cursor: pointer; padding: 0 0 3px;
  display: flex; align-items: center; justify-content: center;
}
.lb-nav:hover { background: rgba(255, 255, 255, .28); }
.lb-nav.prev { left: 14px; }
.lb-nav.next { right: 14px; }
.lb-foot { display: flex; align-items: center; gap: 14px; margin-top: 14px; flex-wrap: wrap; justify-content: center; }
.lb-cap { color: rgba(255, 255, 255, .85); font-size: 13px; }
.lb-del {
  border: none; border-radius: 999px; background: rgba(255, 255, 255, .14); color: #fff;
  font-size: 12.5px; padding: 6px 14px; cursor: pointer;
}
.lb-del:hover { background: var(--danger); }
.lb-loading {
  position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
  background: rgba(255, 255, 255, .16); color: #fff; font-size: 12px; border-radius: 999px; padding: 5px 14px;
}

@media (max-width: 767px) {
  .g-overlay { padding: 0; align-items: flex-end; }
  .g-panel { max-width: 100%; border-radius: 18px 18px 0 0; max-height: 90vh; }
  .lb-overlay { padding: 44px 8px 16px; }
  .lb-nav { width: 34px; height: 34px; }
  .lb-nav.prev { left: 6px; }
  .lb-nav.next { right: 6px; }
}

/* 弹窗过渡（与 UiModal 同款） */
.modal-enter-active, .modal-leave-active { transition: opacity .2s; }
.modal-enter-active .g-panel, .modal-leave-active .g-panel { transition: transform .22s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .g-panel, .modal-leave-to .g-panel { transform: translateY(40px); }
</style>
