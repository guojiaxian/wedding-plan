import { defineStore } from 'pinia'
import { api } from '../api/client'

export interface AuthUser {
  id: number
  username: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    checked: false
  }),
  actions: {
    async fetchMe() {
      try {
        const r = await api.get<{ user: AuthUser }>('/auth/me')
        this.user = r.user
      } catch {
        this.user = null
      } finally {
        this.checked = true
      }
    },
    async login(username: string, password: string) {
      const r = await api.post<{ user: AuthUser }>('/auth/login', { username, password })
      this.user = r.user
      this.checked = true
      return r.user
    },
    async updateUsername(username: string) {
      const r = await api.post<{ user: AuthUser }>('/auth/username', { username })
      this.user = r.user
      return r.user
    },
    async logout() {
      try {
        await api.post('/auth/logout')
      } catch { /* 会话可能已失效，忽略 */ }
      this.user = null
    }
  }
})
