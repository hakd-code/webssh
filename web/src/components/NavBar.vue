<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSiteStore } from '@/stores/site'
import { useAuthStore } from '@/stores/auth'
import ThemeSwitch from '@/components/ThemeSwitch.vue'

const site = useSiteStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const drawerOpen = ref(false)
const isMobile = ref(window.innerWidth < 900)
window.addEventListener('resize', () => {
  isMobile.value = window.innerWidth < 900
})

const navs = computed(() => site.info.navs || [])

function isRouteActive(url: string): boolean {
  if (!url.startsWith('/')) return false
  return route.path === url || (url !== '/' && route.path.startsWith(url))
}

function onNavClick(item: { url: string; newWindow: boolean }) {
  drawerOpen.value = false
  if (item.url.startsWith('/')) {
    if (item.newWindow) {
      window.open(router.resolve(item.url).href, '_blank')
    } else {
      router.push(item.url)
    }
  } else if (item.newWindow) {
    window.open(item.url, '_blank', 'noopener')
  } else {
    window.open(item.url, '_self')
  }
}

function handleUserCommand(cmd: string) {
  const map: Record<string, string> = {
    profiles: '/profiles',
    terminal: '/terminal',
    settings: '/settings',
    admin: '/admin',
  }
  if (map[cmd]) router.push(map[cmd])
  else if (cmd === 'logout') void onLogout()
}

async function onLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗?', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  auth.logout()
  drawerOpen.value = false
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<template>
  <header class="ws-nav">
    <div class="ws-nav-inner">
      <router-link to="/" class="ws-logo">
        <el-icon :size="22"><Monitor /></el-icon>
        <span>{{ site.info.siteName || 'WebSSH' }}</span>
      </router-link>

      <!-- 桌面端导航 -->
      <nav v-if="!isMobile" class="ws-nav-links">
        <a
          v-for="item in navs"
          :key="item.id"
          class="ws-nav-link"
          :class="{ 'is-active': item.url.startsWith('/') && isRouteActive(item.url) }"
          :href="item.url.startsWith('/') ? '#' : item.url"
          :target="item.newWindow ? '_blank' : undefined"
          :rel="item.newWindow ? 'noopener noreferrer' : undefined"
          @click.prevent="onNavClick(item)"
        >
          {{ item.label }}
        </a>
      </nav>
      <div v-else style="flex: 1"></div>

      <div class="ws-nav-actions">
        <ThemeSwitch />
        <template v-if="!auth.isLoggedIn">
          <el-button v-if="!isMobile" text @click="router.push('/login')">登录</el-button>
          <el-button v-if="!isMobile" type="primary" @click="router.push('/register')">注册</el-button>
        </template>
        <el-dropdown v-else-if="!isMobile" trigger="click" @command="handleUserCommand">
          <span class="user-chip">
            <el-avatar :size="28" class="user-avatar">
              {{ auth.user?.username?.slice(0, 1).toUpperCase() }}
            </el-avatar>
            <span class="user-name">{{ auth.user?.username }}</span>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profiles">
                <el-icon><Coin /></el-icon>我的 VPS
              </el-dropdown-item>
              <el-dropdown-item command="terminal">
                <el-icon><Platform /></el-icon>终端工作台
              </el-dropdown-item>
              <el-dropdown-item command="settings">
                <el-icon><Setting /></el-icon>个人设置
              </el-dropdown-item>
              <el-dropdown-item v-if="auth.isAdmin" command="admin">
                <el-icon><Stamp /></el-icon>管理后台
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-button v-if="isMobile" text aria-label="菜单" @click="drawerOpen = true">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
      </div>
    </div>

    <el-drawer v-model="drawerOpen" title="导航菜单" size="280px" direction="rtl">
      <div class="drawer-nav">
        <a
          v-for="item in navs"
          :key="item.id"
          class="drawer-link"
          :class="{ 'is-active': item.url.startsWith('/') && isRouteActive(item.url) }"
          @click="onNavClick(item)"
        >
          {{ item.label }}
        </a>
      </div>
      <div class="drawer-user">
        <template v-if="auth.isLoggedIn">
          <p class="drawer-user-name">{{ auth.user?.username }}</p>
          <el-button
            type="primary"
            plain
            style="width: 100%"
            @click="router.push('/settings'); drawerOpen = false"
          >
            个人设置
          </el-button>
          <el-button
            v-if="auth.isAdmin"
            plain
            style="width: 100%; margin: 10px 0 0"
            @click="router.push('/admin'); drawerOpen = false"
          >
            管理后台
          </el-button>
          <el-button type="danger" plain style="width: 100%; margin: 10px 0 0" @click="onLogout">
            退出登录
          </el-button>
        </template>
        <template v-else>
          <el-button
            type="primary"
            style="width: 100%"
            @click="router.push('/login'); drawerOpen = false"
          >
            登录
          </el-button>
          <el-button
            plain
            style="width: 100%; margin: 10px 0 0"
            @click="router.push('/register'); drawerOpen = false"
          >
            注册
          </el-button>
        </template>
      </div>
    </el-drawer>
  </header>
</template>

<style scoped>
.ws-nav-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 10px;
  outline: none;
  transition: background 0.2s;
}

.user-chip:hover {
  background: var(--el-fill-color-light);
}

.user-avatar {
  background: linear-gradient(135deg, #409eff, #6366f1);
  color: #fff;
  font-weight: 600;
}

.user-name {
  font-size: 14px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}

.drawer-link {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
  cursor: pointer;
}

.drawer-link:hover {
  background: var(--el-fill-color-light);
}

.drawer-link.is-active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-weight: 600;
}

.drawer-user-name {
  font-weight: 600;
  margin: 0 0 12px;
}
</style>
