<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProfilesStore } from '@/stores/profiles'
import TerminalPane from '@/components/TerminalPane.vue'

const route = useRoute()
const router = useRouter()
const store = useProfilesStore()
const profile = ref<null | { id: string; name: string; host: string; port: number; username: string }>(null)
const loading = ref(true)
const notFound = ref(false)

onMounted(async () => {
  const id = String(route.params.profileId || '')
  try {
    await store.fetch()
    const found = store.items.find((p) => p.id === id)
    if (found) {
      profile.value = found
      await store.touch(id)
    } else {
      notFound.value = true
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="terminal-shell">
    <!-- 顶部信息条 -->
    <div class="single-toolbar">
      <el-button text @click="router.push('/profiles')">
        <el-icon><Back /></el-icon>返回档案
      </el-button>
      <el-divider direction="vertical" />
      <template v-if="profile">
        <span class="single-title">{{ profile.name }}</span>
        <span class="single-host">{{ profile.host }}:{{ profile.port }}</span>
        <el-tag size="small" effect="plain" style="margin-left: 8px">{{ profile.username }}</el-tag>
      </template>
      <template v-else-if="loading">
        <el-skeleton :rows="1" animated style="width: 260px" />
      </template>
    </div>

    <div class="terminal-body">
      <el-empty v-if="notFound" description="档案不存在或已被删除" style="margin: auto">
        <el-button type="primary" @click="router.push('/profiles')">返回档案列表</el-button>
      </el-empty>
      <TerminalPane v-else-if="profile" :profile-id="profile.id" />
      <div v-else style="display: flex; align-items: center; justify-content: center; height: 100%">
        <el-skeleton :rows="6" animated style="width: 80%" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.single-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.single-title {
  font-weight: 600;
}

.single-host {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
