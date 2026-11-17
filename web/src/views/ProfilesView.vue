<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useProfilesStore, type ProfilePayload } from '@/stores/profiles'
import type { Profile, AuthType } from '@/api/types'

const router = useRouter()
const store = useProfilesStore()

const search = ref('')
const sort = ref('recent')
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref<FormInstance>()

const form = reactive({
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authType: 'password' as AuthType,
  password: '',
  privateKey: '',
  passphrase: '',
  note: '',
})

const editingProfile = ref<Profile | null>(null)

const rules: FormRules = {
  name: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  host: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }],
  username: [{ required: true, message: '请输入登录用户', trigger: 'blur' }],
  password: [
    {
      validator: (_r, v: string, cb) => {
        if (form.authType === 'password' && !editingId.value && !v) cb(new Error('密码认证时必须填写密码'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  privateKey: [
    {
      validator: (_r, v: string, cb) => {
        if (form.authType === 'privateKey' && !editingId.value && !v) cb(new Error('密钥认证时必须填写私钥'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

const filteredItems = computed(() => {
  // 服务端已做搜索,这里仅按排序触发重新拉取
  return store.items
})

const loading = computed(() => store.loading)

onMounted(() => {
  store.fetch(search.value, sort.value)
})

function refresh() {
  store.fetch(search.value, sort.value)
}

function openCreate() {
  editingId.value = null
  editingProfile.value = null
  Object.assign(form, {
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    note: '',
  })
  dialogVisible.value = true
}

function openEdit(p: Profile) {
  editingId.value = p.id
  editingProfile.value = p
  Object.assign(form, {
    name: p.name,
    host: p.host,
    port: p.port,
    username: p.username,
    authType: p.authType,
    password: '',
    privateKey: '',
    passphrase: '',
    note: p.note || '',
  })
  dialogVisible.value = true
}

function buildPayload(): Partial<ProfilePayload> {
  const payload: Partial<ProfilePayload> = {
    name: form.name.trim(),
    host: form.host.trim(),
    port: form.port,
    username: form.username.trim(),
    authType: form.authType,
    note: form.note.trim() || null,
  }
  if (!editingId.value) {
    // 新建:全部提交
    if (form.authType === 'password') payload.password = form.password
    else {
      payload.privateKey = form.privateKey
      payload.passphrase = form.passphrase || null
    }
  } else {
    // 编辑:仅当用户输入了新凭据才提交(空 = 保留原值)
    if (form.authType === 'password' && form.password) payload.password = form.password
    if (form.authType === 'privateKey' && form.privateKey) {
      payload.privateKey = form.privateKey
      if (form.passphrase) payload.passphrase = form.passphrase
    }
  }
  return payload
}

async function onSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editingId.value) {
      await store.update(editingId.value, buildPayload())
      ElMessage.success('档案已更新')
    } else {
      await store.create(buildPayload() as ProfilePayload)
      ElMessage.success('档案已创建')
    }
    dialogVisible.value = false
  } catch {
    /* 拦截器提示 */
  } finally {
    saving.value = false
  }
}

async function onConnect(p: Profile) {
  await store.touch(p.id)
  router.push(`/terminal/${p.id}`)
}

async function onCopy(p: Profile) {
  try {
    await store.copy(p.id)
    ElMessage.success(`已复制为「${p.name} (副本)」`)
  } catch {
    /* 拦截器提示 */
  }
}

async function onDelete(p: Profile) {
  try {
    await ElMessageBox.confirm(
      `确定删除档案「${p.name}」(${p.host}:${p.port})吗?此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await store.remove(p.id)
    ElMessage.success('档案已删除')
  } catch {
    /* 拦截器提示 */
  }
}

function fmtTime(t?: string | null) {
  if (!t) return '从未使用'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

function authTypeLabel(p: Profile) {
  return p.authType === 'password' ? '密码' : '密钥'
}
</script>

<template>
  <div class="page">
    <div class="toolbar" style="margin-bottom: 18px">
      <h2 class="section-title" style="margin: 0">
        <el-icon><Coin /></el-icon>我的 VPS 档案
      </h2>
      <div class="toolbar-right" style="margin-left: auto">
        <el-input
          v-model="search"
          placeholder="搜索名称 / 主机 / 备注…"
          clearable
          style="width: 240px"
          @input="refresh"
          @clear="refresh"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="sort" style="width: 140px" @change="refresh">
          <el-option label="最近使用" value="recent" />
          <el-option label="按名称" value="name" />
          <el-option label="最新创建" value="created" />
        </el-select>
        <el-button type="primary" @click="openCreate">
          <el-icon style="margin-right: 4px"><Plus /></el-icon>新建档案
        </el-button>
      </div>
    </div>

    <!-- 骨架屏 -->
    <div v-if="loading && !store.loaded" class="profile-grid">
      <div v-for="i in 4" :key="i" class="ws-card">
        <el-skeleton :rows="4" animated />
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="filteredItems.length === 0" description="还没有连接档案,点击右上角「新建档案」添加你的第一台 VPS">
      <el-button type="primary" @click="openCreate">立即创建</el-button>
    </el-empty>

    <!-- 卡片列表 -->
    <div v-else class="profile-grid">
      <div v-for="p in filteredItems" :key="p.id" class="ws-card ws-card--hover profile-card">
        <div class="profile-head">
          <span class="profile-name" :title="p.name">{{ p.name }}</span>
          <el-tag size="small" effect="plain">{{ authTypeLabel(p) }}</el-tag>
        </div>
        <div class="profile-host">
          <el-icon><Link /></el-icon>
          {{ p.host }}:{{ p.port }}
        </div>
        <div class="profile-user">
          <el-icon><User /></el-icon>
          {{ p.username }}
        </div>
        <p v-if="p.note" class="profile-note" :title="p.note">{{ p.note }}</p>
        <div class="profile-time">最近使用:{{ fmtTime(p.lastUsedAt) }}</div>
        <div class="profile-actions">
          <el-button type="primary" size="small" @click="onConnect(p)">
            <el-icon style="margin-right: 2px"><VideoPlay /></el-icon>连接
          </el-button>
          <el-button size="small" @click="openEdit(p)">编辑</el-button>
          <el-button size="small" @click="onCopy(p)">复制</el-button>
          <el-button size="small" type="danger" plain @click="onDelete(p)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑档案' : '新建档案'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-row :gutter="12">
          <el-col :span="14">
            <el-form-item label="显示名称" prop="name">
              <el-input v-model="form.name" placeholder="如:美国-生产机" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="端口" prop="port">
              <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="14">
            <el-form-item label="主机地址" prop="host">
              <el-input v-model="form.host" placeholder="IP 或域名" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="登录用户" prop="username">
              <el-input v-model="form.username" placeholder="默认 root" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="认证方式">
          <el-radio-group v-model="form.authType" :disabled="Boolean(editingId)">
            <el-radio-button value="password">密码</el-radio-button>
            <el-radio-button value="privateKey">私钥</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="form.authType === 'password'">
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              :placeholder="editingId && editingProfile?.hasPassword ? '已保存,留空表示保留不修改' : 'SSH 登录密码'"
            />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="私钥" prop="privateKey">
            <el-input
              v-model="form.privateKey"
              type="textarea"
              :rows="5"
              :placeholder="editingId && editingProfile?.hasPrivateKey ? '已保存,留空表示保留不修改' : '-----BEGIN OPENSSH PRIVATE KEY-----'"
            />
          </el-form-item>
          <el-form-item label="私钥口令(可选)">
            <el-input
              v-model="form.passphrase"
              type="password"
              show-password
              :placeholder="editingId && editingProfile?.hasPassphrase ? '已保存,留空表示保留不修改' : '若私钥加密请填写'"
            />
          </el-form-item>
        </template>

        <el-form-item label="备注(可选)">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="操作系统版本、用途等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.profile-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.profile-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-host,
.profile-user {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.profile-note {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.profile-actions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
