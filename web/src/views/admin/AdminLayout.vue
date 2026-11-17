<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()

const menu = [
  { index: '/admin', label: '后台概览', icon: 'Odometer' },
  { index: '/admin/settings', label: '站点设置', icon: 'Setting' },
  { index: '/admin/navs', label: '导航管理', icon: 'Menu' },
  { index: '/admin/footer', label: '页脚管理', icon: 'Document' },
  { index: '/admin/users', label: '用户管理', icon: 'User' },
]

const activeIndex = computed(() => '/' + route.path.split('/').slice(1, 2).join('') + (route.path.split('/')[2] ? '/' + route.path.split('/')[2] : ''))

function onSelect(index: string) {
  router.push(index)
}
</script>

<template>
  <div class="admin-layout page page--full">
    <div class="admin-side ws-card">
      <div class="admin-side-title">
        <el-icon><Stamp /></el-icon>管理后台
      </div>
      <el-menu :default-active="activeIndex" class="admin-menu" @select="onSelect">
        <el-menu-item v-for="m in menu" :key="m.index" :index="m.index">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.label }}</span>
        </el-menu-item>
      </el-menu>
    </div>
    <div class="admin-content">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  gap: 20px;
  max-width: 1400px;
}

.admin-side {
  width: 200px;
  flex-shrink: 0;
  padding: 16px;
  height: fit-content;
  position: sticky;
  top: calc(var(--ws-nav-height) + 20px);
}

.admin-side-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: var(--el-color-primary);
  padding: 4px 8px 14px;
}

.admin-menu {
  border-right: none;
}

.admin-content {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .admin-layout {
    flex-direction: column;
  }
  .admin-side {
    width: 100%;
    position: static;
  }
}
</style>
