<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import type { ThemeMode } from '@/api/types'

const theme = useThemeStore()
const auth = useAuthStore()

const icon = computed(() =>
  theme.mode === 'dark' ? 'Moon' : theme.mode === 'light' ? 'Sunny' : 'Monitor'
)

function onChange(mode: ThemeMode) {
  theme.setMode(mode, auth.isLoggedIn)
}
</script>

<template>
  <el-dropdown trigger="click" @command="onChange">
    <span class="theme-trigger" title="切换主题">
      <el-icon :size="18">
        <component :is="icon" />
      </el-icon>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="light">
          <el-icon><Sunny /></el-icon>亮色模式
          <el-icon v-if="theme.mode === 'light'" class="check"><Check /></el-icon>
        </el-dropdown-item>
        <el-dropdown-item command="dark">
          <el-icon><Moon /></el-icon>暗色模式
          <el-icon v-if="theme.mode === 'dark'" class="check"><Check /></el-icon>
        </el-dropdown-item>
        <el-dropdown-item command="system">
          <el-icon><Monitor /></el-icon>跟随系统
          <el-icon v-if="theme.mode === 'system'" class="check"><Check /></el-icon>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.theme-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: background 0.2s;
  outline: none;
}
.theme-trigger:hover {
  background: var(--el-fill-color-light);
}
.check {
  margin-left: auto;
  color: var(--el-color-primary);
}
</style>
