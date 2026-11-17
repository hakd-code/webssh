<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useSiteStore } from '@/stores/site'
import type { NavItem } from '@/api/types'

const site = useSiteStore()
const items = ref<(NavItem & { enabled: boolean })[]>([])
const loading = ref(true)
const saving = ref(false)

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ label: '', url: '', newWindow: false, enabled: true })

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/admin/navs', { silent: true })
    items.value = data.items
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  editingId.value = null
  Object.assign(form, { label: '', url: '', newWindow: false, enabled: true })
  dialogVisible.value = true
}

function openEdit(item: NavItem & { enabled: boolean }) {
  editingId.value = item.id
  Object.assign(form, { label: item.label, url: item.url, newWindow: item.newWindow, enabled: item.enabled })
  dialogVisible.value = true
}

async function onSave() {
  if (!form.label.trim() || !form.url.trim()) {
    ElMessage.warning('名称与链接不能为空')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await http.patch(`/admin/navs/${editingId.value}`, { ...form, label: form.label.trim(), url: form.url.trim() })
      ElMessage.success('导航已更新')
    } else {
      await http.post('/admin/navs', { ...form, label: form.label.trim(), url: form.url.trim() })
      ElMessage.success('导航已新增')
    }
    dialogVisible.value = false
    await load()
    site.invalidate()
    site.fetchSite(true)
  } catch {
    /* 拦截器提示 */
  } finally {
    saving.value = false
  }
}

async function onDelete(item: NavItem) {
  try {
    await ElMessageBox.confirm(`确定删除导航「${item.label}」吗?`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await http.delete(`/admin/navs/${item.id}`)
    ElMessage.success('已删除')
    await load()
    site.invalidate()
    site.fetchSite(true)
  } catch {
    /* 拦截器提示 */
  }
}

async function onToggle(item: NavItem & { enabled: boolean }) {
  try {
    await http.patch(`/admin/navs/${item.id}`, { enabled: item.enabled })
    site.invalidate()
    site.fetchSite(true)
    ElMessage.success(item.enabled ? '已启用' : '已停用')
  } catch {
    item.enabled = !item.enabled
  }
}

async function onMove(item: NavItem, direction: 'up' | 'down') {
  try {
    await http.post(`/admin/navs/${item.id}/move`, { direction })
    await load()
    site.invalidate()
    site.fetchSite(true)
  } catch (err: any) {
    if (err?.response?.data?.message) ElMessage.info(err.response.data.message)
  }
}
</script>

<template>
  <div>
    <div class="toolbar" style="margin-bottom: 16px">
      <h2 class="section-title" style="margin: 0"><el-icon><Menu /></el-icon>导航管理</h2>
      <el-button type="primary" style="margin-left: auto" @click="openCreate">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增导航
      </el-button>
    </div>

    <div class="ws-card">
      <div v-if="loading"><el-skeleton :rows="5" animated /></div>
      <el-empty v-else-if="items.length === 0" description="暂无导航项" />
      <el-table v-else :data="items" style="width: 100%">
        <el-table-column label="名称" min-width="140">
          <template #default="{ row }">{{ row.label }}</template>
        </el-table-column>
        <el-table-column label="链接" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mono">{{ row.url }}</span>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="150">
          <template #default="{ row }">
            <el-button-group size="small">
              <el-button :disabled="row.sort <= items[0]?.sort" @click="onMove(row, 'up')">
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button :disabled="row.sort >= items[items.length - 1]?.sort" @click="onMove(row, 'down')">
                <el-icon><ArrowDown /></el-icon>
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
        <el-table-column label="新窗口" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.newWindow ? 'success' : 'info'" effect="plain">
              {{ row.newWindow ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="onToggle(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑导航' : '新增导航'" width="480px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="名称" required>
          <el-input v-model="form.label" placeholder="如:首页" maxlength="32" />
        </el-form-item>
        <el-form-item label="链接(URL 或站内路由)" required>
          <el-input v-model="form.url" placeholder="/profiles 或 https://example.com" maxlength="500" />
        </el-form-item>
        <el-form-item label="选项">
          <el-checkbox v-model="form.newWindow">在新窗口打开</el-checkbox>
          <el-checkbox v-model="form.enabled">启用</el-checkbox>
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
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
}
</style>
