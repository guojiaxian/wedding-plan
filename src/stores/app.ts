import { defineStore } from 'pinia'
import { api } from '../api/client'
import type { Settings } from '../api/types'

export const useAppStore = defineStore('app', {
  state: () => ({
    settings: null as Settings | null,
    loaded: false
  }),
  getters: {
    // 婚礼倒计时（天）；未设置日期返回 null
    countdownDays(state): number | null {
      if (!state.settings?.wedding_date) return null
      const target = new Date(state.settings.wedding_date + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return Math.round((target.getTime() - today.getTime()) / 86400000)
    },
    coupleText(state): string {
      const s = state.settings
      if (!s) return ''
      return [s.groom_name, s.bride_name].filter(Boolean).join(' ❤ ') || '备婚计划'
    },
    dateText(state): string {
      const d = state.settings?.wedding_date
      if (!d) return ''
      const [y, m, day] = d.split('-')
      return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`
    }
  },
  actions: {
    async loadSettings(force = false) {
      if (this.loaded && !force) return
      this.settings = await api.get<Settings>('/settings')
      this.loaded = true
    },
    async saveSettings(patch: Partial<Settings>) {
      this.settings = await api.put<Settings>('/settings', patch)
    }
  }
})
