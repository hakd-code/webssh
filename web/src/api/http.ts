import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const TOKEN_KEY = 'webssh-token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
})

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let redirectingToLogin = false

function toLogin() {
  clearToken()
  const route = router.currentRoute.value
  if (route.path !== '/login' && route.meta?.requiresAuth) {
    if (!redirectingToLogin) {
      redirectingToLogin = true
      setTimeout(() => (redirectingToLogin = false), 1500)
      ElMessage.warning('登录状态已失效,请重新登录')
    }
    router.push({ path: '/login', query: { redirect: route.fullPath } })
  }
}

http.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status
    const cfg = (error.config || {}) as AxiosRequestConfig & { silent?: boolean }
    const msg: string = error?.response?.data?.message || '请求失败,请检查网络后重试'
    if (status === 401) {
      toLogin()
      // 静默探活的请求不弹错误
      if (!cfg.silent) ElMessage.error(msg)
    } else if (!cfg.silent) {
      ElMessage.error(msg)
    }
    return Promise.reject(error)
  }
)

/** 带静默标记的辅助类型 */
export const request = http as typeof http & {
  get<T = any>(url: string, config?: AxiosRequestConfig & { silent?: boolean }): Promise<T>
}

export default http
