<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type { AdminUser } from '@/api/types'

const auth = useAuthStore()
const items = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const loading = ref(false)

const editVisible = ref(false)
const editSaving = ref(false)
const editForm = reactive({ id: '', username: '', email: '', role: 'user' as 'user' | 'admin', status: 'active' as 'active' | 'disabled' })

const pwdVisible = ref(false)
const pwdSaving = ref(false)
const pwdTarget = ref<AdminUser | null>(null)
const pwdForm = reactive({ password: '' })

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/admin/users', {
      params: { page: page.value, pageSize: pageSize.value, search: search.value || undefined },
      silent: true,
    })
    items.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}

onMounted(load)

function onSearch() {
  page.value = 1
  load()
}

function openEdit(u: AdminUser) {
  Object.assign(editForm, { id: u.id, username: u.username, email: u.email, role: u.role, status: u.status })
  editVisible.value = true
}

async function onSaveEdit() {
  editSaving.value = true
  try {
    await http.patch(`/admin/users/${editForm.id}`, {
      email: editForm.email,
      role: editForm.role,
      status: editForm.status,
    })
    ElMessage.success('用户已更新')
    editVisible.value = false
    await load()
  } catch {
    /* 拦截器提示 */
  } finally {
    editSaving.value = false
  }
}

function openPwd(u: AdminUser) {
  pwdTarget.value = u
  pwdForm.password = ''
  pwdVisible.value = true
}

async function onSavePwd() {
  if (!pwdTarget.value) return
  if (pwdForm.password.length < 8 || !/[A-Za-z]/.test(pwdForm.password) || !/[0-9]/.test(pwdForm.password)) {
    ElMessage.warning('密码至少 8 位,且需包含字母和数字')
    return
  }
  pwdSaving.value = true
  try {
    await http.patch(`/admin/users/${pwdTarget.value.id}`, { password: pwdForm.password })
    ElMessage.success(`已重置「${pwdTarget.value.username}」的密码,其所有登录已失效`)
    pwdVisible.value = false
  } catch {
    /* 拦截器提示 */
  } finally {
    pwdSaving.value = false
  }
}

async function onToggleStatus(u: AdminUser) {
  const toDisabled = u.status === 'active'
  try {
    await ElMessageBox.confirm(
      toDisabled
        ? `确定禁用用户「${u.username}」吗?该用户所有登录与终端连接将立即失效。`
        : `确定启用用户「${u.username}」吗?`,
      '确认操作',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await http.patch(`/admin/users/${u.id}`, { status: toDisabled ? 'disabled' : 'active' })
    ElMessage.success(toDisabled ? '已禁用' : '已启用')
    await load()
  } catch {
    /* 拦截器提示 */
  }
}

async function onDelete(u: AdminUser) {
  try {
    await ElMessageBox.confirm(
      `确定删除用户「${u.username}」吗?将级联删除其 ${u.profileCount} 个 VPS 档案,此操作不可恢复!`,
      '删除用户',
      {
        confirmButtonText: '删除用户',
        cancelButtonText: '取消',
        type: 'error',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }
  try {
    const { data } = await http.delete(`/admin/users/${u.id}`)
    ElMessage.success(data.message || '已删除')
    await load()
  } catch {
    /* 拦截器提示 */
  }
}

function fmt(t?: string | null) {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '从未登录'
}

function isSelf(u: AdminUser) {
  return u.id === auth.user?.id
}
</script>

<template>
  <div>
    <div class="toolbar" style="margin-bottom: 16px">
      <h2 class="section-title" style="margin: 0"><el-icon><User /></el-icon>用户管理</h2>
      <div class="toolbar-right" style="margin-left: auto">
        <el-input
          v-model="search"
          placeholder="搜索用户名 / 邮箱"
          clearable
          style="width: 240px"
          @input="onSearch"
          @clear="onSearch"
          @keyup.enter="onSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button @click="onSearch">搜索</el-button>
      </div>
    </div>

    <div class="ws-card">
      <el-table v-loading="loading" :data="items" style="width: 100%">
        <el-table-column label="用户名" min-width="120">
          <template #default="{ row }">
            <span class="u-name">{{ row.username }}</span>
            <el-tag v-if="isSelf(row)" size="small" effect="plain" style="margin-left: 6px">我</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="邮箱" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.email }}</template>
        </el-table-column>
        <el-table-column label="角色" width="90">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'primary'" size="small" effect="plain">
              {{ row.role === 'admin' ? '管理员' : '用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" effect="plain">
              {{ row.status === 'active' ? '正常' : '已禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="档案数" width="80" prop="profileCount" />
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">{{ fmt(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openPwd(row)">重置密码</el-button>
            <el-button size="small" :type="row.status === 'active' ? 'warning' : 'success'" plain :disabled="isSelf(row)" @click="onToggleStatus(row)">
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" plain :disabled="isSelf(row)" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="onSearch"
        />
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" :title="`编辑用户:${editForm.username}`" width="460px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="邮箱">
          <el-input v-model="editForm.email" />
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="editForm.role" :disabled="isSelf({ id: editForm.id } as AdminUser)">
            <el-radio-button value="user">普通用户</el-radio-button>
            <el-radio-button value="admin">管理员</el-radio-button>
          </el-radio-group>
          <div class="field-tip">不可对自己降权;停用/降级最后一个管理员会被拒绝。</div>
        </el-form-item>
        <el-form-item label="账户状态">
          <el-switch
            v-model="editForm.status"
            active-value="active"
            inactive-value="disabled"
            active-text="正常"
            inactive-text="禁用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="onSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog v-model="pwdVisible" :title="`重置密码:${pwdTarget?.username}`" width="420px" destroy-on-close>
      <el-form label-position="top" @submit.prevent="onSavePwd">
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.password" type="password" show-password placeholder="至少 8 位,含字母和数字" @keyup.enter="onSavePwd" />
        </el-form-item>
        <p class="field-tip">重置后该用户所有已登录设备(含终端)将立即失效。</p>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSaving" @click="onSavePwd">重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.u-name {
  font-weight: 600;
}

.field-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}
</style>
