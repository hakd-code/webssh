import { defineStore } from 'pinia'
import http, { getToken, setToken, clearToken } from '@/api/http'
import type { UserInfo, ThemeMode } from '@/api/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: null as UserInfo | null,
    meLoaded: false,
  }),
  getters: {
    isLoggedIn(state): boolean {
      return Boolean(state.token)
    },
    isAdmin(state): boolean {
      return state.user?.role === 'admin'
    },
  },
  actions: {
    async login(account: string, password: string, rememberMe: boolean) {
      const { data } = await http.post('/auth/login', { account, password, rememberMe })
      this.token = data.token
      this.user = data.user
      this.meLoaded = true
      setToken(data.token)
      // 登录后应用用户主题偏好
      if (data.user?.theme) {
        import('./theme').then(({ useThemeStore }) => {
          useThemeStore().setMode(data.user.theme as ThemeMode)
        })
      }
      return data.user as UserInfo
    },
    async register(payload: { username: string; email: string; password: string }) {
      const { data } = await http.post('/auth/register', payload)
      this.token = data.token
      this.user = data.user
      this.meLoaded = true
      setToken(data.token)
      return data.user as UserInfo
    },
    async fetchMe() {
      if (!this.token) return
      try {
        const { data } = await http.get('/auth/me', { silent: true })
        this.user = data.user
        this.meLoaded = true
        if (data.user?.status && data.user.status !== 'active') {
          this.forceLogout()
        }
      } catch {
        // 401 由拦截器统一处理
        if (!getToken()) this.token = ''
      }
    },
    async ensureUser() {
      if (this.user) return this.user
      if (this.token && !this.meLoaded) await this.fetchMe()
      return this.user
    },
    async syncTheme(mode: ThemeMode) {
      if (!this.token) return
      try {
        await http.patch('/auth/me', { theme: mode })
        if (this.user) this.user.theme = mode
      } catch {
        /* 主题同步失败不打断交互 */
      }
    },
    /** 修改密码后服务端签发新 token */
    applyReissuedToken(token: string | null) {
      if (token) {
        this.token = token
        setToken(token)
      }
    },
    forceLogout() {
      this.token = ''
      this.user = null
      this.meLoaded = false
      clearToken()
    },
    logout() {
      this.forceLogout()
    },
  },
})
