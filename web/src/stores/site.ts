import { defineStore } from 'pinia'
import http from '@/api/http'
import type { SiteInfo } from '@/api/types'

const FALLBACK: SiteInfo = {
  siteName: 'WebSSH 管理平台',
  subtitle: '',
  logo: '',
  loginWelcome: '欢迎回来,请登录以继续',
  allowRegister: true,
  allowGuestSsh: true,
  notice: '',
  navs: [],
  footer: { html: '', copyright: '', icp: '' },
}

export const useSiteStore = defineStore('site', {
  state: () => ({
    loaded: false,
    loading: false,
    info: { ...FALLBACK } as SiteInfo,
  }),
  actions: {
    async fetchSite(force = false) {
      if (this.loading || (this.loaded && !force)) return
      this.loading = true
      try {
        const { data } = await http.get('/public/site', { silent: true })
        this.info = { ...FALLBACK, ...data }
        this.loaded = true
        document.title = this.info.siteName
      } catch {
        // 公开信息获取失败时使用默认值
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    /** admin 修改设置/导航/页脚后刷新缓存 */
    invalidate() {
      this.loaded = false
    },
  },
})
