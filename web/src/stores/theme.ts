import { defineStore } from 'pinia'
import type { ThemeMode } from '@/api/types'

const THEME_KEY = 'webssh-theme'

function readStoredMode(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: readStoredMode(),
    systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  }),
  getters: {
    isDark(state): boolean {
      return state.mode === 'dark' || (state.mode === 'system' && state.systemDark)
    },
  },
  actions: {
    init() {
      // 跟随系统变化
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', (e) => {
        this.systemDark = e.matches
        this.apply()
      })
      this.apply()
    },
    apply() {
      document.documentElement.classList.toggle('dark', this.isDark)
    },
    /** 切换主题;sync=true 时同步到当前用户偏好 */
    setMode(mode: ThemeMode, sync = false) {
      this.mode = mode
      localStorage.setItem(THEME_KEY, mode)
      this.apply()
      if (sync) {
        // 延迟 import 避免循环依赖
        import('@/stores/auth').then(({ useAuthStore }) => {
          useAuthStore().syncTheme(mode)
        })
      }
    },
  },
})
