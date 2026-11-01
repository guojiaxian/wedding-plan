<script setup lang="ts">
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <teleport to="body">
    <transition name="modal">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="panel">
          <div class="head">
            <h3>{{ title }}</h3>
            <button class="close" @click="emit('close')">✕</button>
          </div>
          <div class="body">
            <slot />
          </div>
          <div class="foot" v-if="$slots.footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(74, 59, 66, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.panel {
  background: #fff; border-radius: 18px; width: 100%; max-width: 520px;
  max-height: 86vh; display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg); overflow: hidden;
}
.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px; border-bottom: 1px solid var(--line);
}
.head h3 { font-size: 16px; font-weight: 700; }
.close {
  border: none; background: var(--primary-soft); color: var(--secondary);
  width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 13px;
}
.close:hover { background: var(--primary); color: #fff; }
.body { padding: 16px 20px; overflow-y: auto; }
.foot {
  padding: 12px 20px 16px; border-top: 1px solid var(--line);
  display: flex; gap: 10px; justify-content: flex-end;
}

.modal-enter-active, .modal-leave-active { transition: opacity .2s; }
.modal-enter-active .panel, .modal-leave-active .panel { transition: transform .22s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .panel, .modal-leave-to .panel { transform: translateY(40px); }

@media (max-width: 767px) {
  .overlay { padding: 0; align-items: flex-end; }
  .panel { max-width: 100%; border-radius: 18px 18px 0 0; max-height: 90vh; }
}
</style>
