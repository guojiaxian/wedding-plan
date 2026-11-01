<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  percent: number
  size?: number
  stroke?: number
  /** 显式指定颜色时优先使用；否则跟随主题变量 --ring-color */
  color?: string
  track?: string
}>(), {
  size: 132,
  stroke: 12,
  color: '',
  track: ''
})

const RADIUS = 50 // 圆心 50,50；viewBox 随描边外扩，避免圆环被裁切
const C = 2 * Math.PI * RADIUS
const clamped = computed(() => Math.max(0, Math.min(100, props.percent)))
const dash = computed(() => (clamped.value / 100) * C)
const viewBox = computed(() => {
  const h = props.stroke / 2
  return `${-h} ${-h} ${100 + props.stroke} ${100 + props.stroke}`
})
const barStyle = computed(() => ({ stroke: props.color || 'var(--ring-color, #D97BA6)' }))
const trackStyle = computed(() => ({ stroke: props.track || 'var(--primary-soft, #FBE3EC)' }))
</script>

<template>
  <div class="ring" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" :viewBox="viewBox">
      <circle cx="50" cy="50" :r="RADIUS" fill="none" :style="trackStyle" :stroke-width="stroke" />
      <circle
        cx="50" cy="50" :r="RADIUS" fill="none" :style="barStyle" :stroke-width="stroke"
        stroke-linecap="round" :stroke-dasharray="`${dash} ${C}`"
        transform="rotate(-90 50 50)"
      />
    </svg>
    <div class="center"><slot /></div>
  </div>
</template>

<style scoped>
.ring { position: relative; flex-shrink: 0; }
.center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; line-height: 1.3;
}
</style>
