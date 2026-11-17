import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { title: '注册', guestOnly: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { title: '忘记密码' },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { title: '重置密码' },
  },
  {
    path: '/quick-ssh',
    name: 'quick-ssh',
    component: () => import('@/views/QuickSshView.vue'),
    meta: { title: '临时 SSH' },
  },
  {
    path: '/profiles',
    name: 'profiles',
    component: () => import('@/views/ProfilesView.vue'),
    meta: { title: '我的 VPS', requiresAuth: true },
  },
  {
    path: '/terminal',
    name: 'terminal-workbench',
    component: () => import('@/views/TerminalWorkbenchView.vue'),
    meta: { title: '终端工作台', requiresAuth: true },
  },
  {
    path: '/terminal/:profileId',
    name: 'terminal-single',
    component: () => import('@/views/TerminalSingleView.vue'),
    meta: { title: '终端', requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '个人设置', requiresAuth: true },
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'admin-home', component: () => import('@/views/admin/AdminHome.vue'), meta: { title: '管理后台' } },
      { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/AdminSettings.vue'), meta: { title: '站点设置' } },
      { path: 'navs', name: 'admin-navs', component: () => import('@/views/admin/AdminNavs.vue'), meta: { title: '导航管理' } },
      { path: 'footer', name: 'admin-footer', component: () => import('@/views/admin/AdminFooter.vue'), meta: { title: '页脚管理' } },
      { path: 'users', name: 'admin-users', component: () => import('@/views/admin/AdminUsers.vue'), meta: { title: '用户管理' } },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // 需要登录
  if (to.meta.requiresAuth && !auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 需要管理员:先确保用户信息已加载
  if (to.meta.requiresAdmin || to.matched.some((r) => r.meta.requiresAdmin)) {
    const user = await auth.ensureUser()
    if (!user) return { path: '/login', query: { redirect: to.fullPath } }
    if (user.role !== 'admin') {
      return { path: '/' }
    }
  }
  // 已登录用户访问登录/注册页 → 跳首页
  if (to.meta.guestOnly && auth.token) {
    return { path: '/' }
  }
})

router.afterEach((to) => {
  const siteName = document.title.replace(/^[^·]+·\s*/, '') || 'WebSSH 管理平台'
  document.title = to.meta.title ? `${to.meta.title} · ${siteName}` : siteName
})

export default router
