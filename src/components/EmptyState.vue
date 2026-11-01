<script setup lang="ts">
defineProps<{ emoji?: string; text: string }>()
</script>

<template>
  <div class="empty">
    <div class="big">{{ emoji || '🌸' }}</div>
    <p>{{ text }}</p>
    <div v-if="$slots.default" style="margin-top: 12px"><slot /></div>
  </div>
</template>
