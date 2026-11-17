<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useTabsStore } from '@/stores/tabs'
import { useProfilesStore } from '@/stores/profiles'
import type { Profile, AuthType } from '@/api/types'
import TerminalPane from '@/components/TerminalPane.vue'

const router = useRouter()
const tabs = useTabsStore()
const profiles = useProfilesStore()

const newDialogVisible = ref(false)
const pickerTab = ref<'profile' | 'temp'>('profile')
const profilesLoading = ref(false)
const profileSearch = ref('')

// 临时连接表单
const tempForm = reactive({
  host: '',
  port: 22,
  username: 'root',
  authType: 'password' as AuthType,
  password: '',
  privateKey: '',
  passphrase: '',
})

const filteredProfiles = ref<Profile[]>([])

function loadProfiles() {
  profilesLoading.value = true
  profiles
    .fetch(profileSearch.value)
    .then(() => {
      filteredProfiles.value = profiles.items
    })
    .finally(() => {
      profilesLoading.value = false
    })
}

onMounted(() => {
  loadProfiles()
})

function openDialog() {
  newDialogVisible.value = true
  pickerTab.value = 'profile'
  loadProfiles()
}

function connectProfile(p: Profile) {
  tabs.openProfile(p.id, p.name)
  profiles.touch(p.id)
  newDialogVisible.value = false
}

function connectTemp() {
  if (!tempForm.host || !tempForm.username) {
    ElMessage.warning('请填写主机与登录用户')
    return
  }
  if (tempForm.authType === 'password' && !tempForm.password) {
    ElMessage.warning('请输入密码')
    return
  }
  if (tempForm.authType === 'privateKey' && !tempForm.privateKey) {
    ElMessage.warning('请输入私钥')
    return
  }
  tabs.openTemp({
    host: tempForm.host.trim(),
    port: tempForm.port,
    username: tempForm.username.trim(),
    authType: tempForm.authType,
    password: tempForm.password,
    privateKey: tempForm.privateKey,
    passphrase: tempForm.passphrase,
  })
  newDialogVisible.value = false
}

function onStatus(tabId: string, status: string) {
  // 可扩展:更新标签状态显示
  void tabId
  void status
}

watch(profileSearch, () => loadProfiles())

// 关闭页面时提示
function beforeUnload(e: BeforeUnloadEvent) {
  if (tabs.tabs.length > 0) {
    e.preventDefault()
    e.returnValue = ''
  }
}
window.addEventListener('beforeunload', beforeUnload)
onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <div class="terminal-shell">
    <!-- 标签栏 -->
    <div class="tabbar">
      <div class="tabbar-tabs">
        <div
          v-for="t in tabs.tabs"
          :key="t.id"
          class="term-tab"
          :class="{ 'is-active': t.id === tabs.activeId }"
          @click="tabs.activeId = t.id"
        >
          <span class="term-tab-title">{{ t.title }}</span>
          <el-icon class="term-tab-close" @click.stop="tabs.close(t.id)"><Close /></el-icon>
        </div>
      </div>
      <div class="tabbar-actions">
        <el-button size="small" type="primary" @click="openDialog">
          <el-icon><Plus /></el-icon>新建连接
        </el-button>
      </div>
    </div>

    <div class="terminal-body">
      <el-empty
        v-if="tabs.tabs.length === 0"
        description="暂无终端会话,点击「新建连接」打开一个 SSH 终端"
        style="margin: auto"
      >
        <el-button type="primary" @click="openDialog">新建连接</el-button>
        <el-button @click="router.push('/profiles')">管理我的 VPS</el-button>
      </el-empty>
      <template v-for="t in tabs.tabs" :key="t.id">
        <div v-show="t.id === tabs.activeId" style="position: absolute; inset: 0 12px 8px">
          <TerminalPane
            v-if="t.kind === 'profile'"
            :profile-id="t.profileId"
            :title="t.title"
            show-virtual-keys
            @status="(s: string) => onStatus(t.id, s)"
            @title="(title: string) => tabs.rename(t.id, title)"
          />
          <TerminalPane
            v-else-if="t.tempParams"
            :temp-params="t.tempParams"
            :title="t.title"
            show-virtual-keys
            @status="(s: string) => onStatus(t.id, s)"
            @title="(title: string) => tabs.rename(t.id, title)"
          />
        </div>
      </template>
    </div>

    <!-- 新建连接弹窗 -->
    <el-dialog v-model="newDialogVisible" title="新建终端连接" width="620px" destroy-on-close>
      <el-tabs v-model="pickerTab">
        <el-tab-pane label="从档案连接" name="profile">
          <el-input
            v-model="profileSearch"
            placeholder="搜索档案…"
            clearable
            style="margin-bottom: 12px"
          />
          <div v-if="profilesLoading" style="padding: 12px">
            <el-skeleton :rows="3" animated />
          </div>
          <el-empty
            v-else-if="filteredProfiles.length === 0"
            description="暂无档案,先去「我的 VPS」创建一个"
            :image-size="80"
          >
            <el-button @click="router.push('/profiles')">去创建档案</el-button>
          </el-empty>
          <div v-else class="picker-list">
            <div
              v-for="p in filteredProfiles"
              :key="p.id"
              class="picker-item"
              @click="connectProfile(p)"
            >
              <div>
                <div class="picker-name">{{ p.name }}</div>
                <div class="picker-host">{{ p.host }}:{{ p.port }} · {{ p.username }}</div>
              </div>
              <el-icon color="var(--el-color-primary)"><VideoPlay /></el-icon>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="临时连接(不保存)" name="temp">
          <el-form label-position="top" @submit.prevent="connectTemp">
            <el-row :gutter="12">
              <el-col :span="16">
                <el-form-item label="主机地址">
                  <el-input v-model="tempForm.host" placeholder="IP 或域名" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="端口">
                  <el-input-number v-model="tempForm.port" :min="1" :max="65535" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="登录用户">
              <el-input v-model="tempForm.username" placeholder="如 root" />
            </el-form-item>
            <el-form-item label="认证方式">
              <el-radio-group v-model="tempForm.authType">
                <el-radio-button value="password">密码</el-radio-button>
                <el-radio-button value="privateKey">私钥</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="tempForm.authType === 'password'" label="密码">
              <el-input v-model="tempForm.password" type="password" show-password @keyup.enter="connectTemp" />
            </el-form-item>
            <el-form-item v-else label="私钥">
              <el-input v-model="tempForm.privateKey" type="textarea" :rows="4" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
            </el-form-item>
            <el-button type="primary" style="width: 100%" @click="connectTemp">连接</el-button>
            <p class="temp-note">临时连接的凭据仅保存在当前页面内存中,不会被持久化。</p>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<style scoped>
.tabbar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 12px;
  gap: 12px;
}

.tabbar-tabs {
  flex: 1;
  display: flex;
  overflow-x: auto;
  gap: 4px;
  scrollbar-width: none;
}

.tabbar-tabs::-webkit-scrollbar {
  display: none;
}

.term-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  border: 1px solid transparent;
  border-bottom: none;
  user-select: none;
}

.term-tab:hover {
  background: var(--el-fill-color-light);
}

.term-tab.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.term-tab-title {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.term-tab-close {
  border-radius: 4px;
  padding: 2px;
}

.term-tab-close:hover {
  background: var(--el-fill-color);
  color: var(--el-color-danger);
}

.tabbar-actions {
  padding: 6px 0;
}

.picker-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.picker-item:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.picker-name {
  font-weight: 600;
  font-size: 14px;
}

.picker-host {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.temp-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 10px 0 0;
}
</style>
