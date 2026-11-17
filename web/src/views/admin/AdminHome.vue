<script setup lang="ts">
import { ref, onMounted } from 'vue'
import http from '@/api/http'
import type { AdminStats, AuditLogItem } from '@/api/types'

const stats = ref<AdminStats | null>(null)
const loading = ref(true)

const ACTION_LABELS: Record<string, string> = {
  LOGIN: '登录',
  LOGIN_FAILED: '登录失败',
  REGISTER: '注册',
  CHANGE_PASSWORD: '修改密码',
  RESET_PASSWORD: '邮件重置密码',
  FORGOT_PASSWORD: '申请重置密码',
  UPDATE_PROFILE: '更新资料',
  CREATE_PROFILE: '创建档案',
  DELETE_PROFILE: '删除档案',
  COPY_PROFILE: '复制档案',
  ADMIN_UPDATE_SETTINGS: '更新站点设置',
  ADMIN_CREATE_NAV: '新增导航',
  ADMIN_UPDATE_NAV: '编辑导航',
  ADMIN_DELETE_NAV: '删除导航',
  ADMIN_UPDATE_FOOTER: '更新页脚',
  ADMIN_UPDATE_USER: '编辑用户',
  ADMIN_RESET_PASSWORD: '管理员重置密码',
  ADMIN_DELETE_USER: '删除用户',
  ADMIN_TEST_SMTP: '发送测试邮件',
  TEMP_SSH_ATTEMPT: '临时 SSH',
}

function actionLabel(a: string) {
  return ACTION_LABELS[a] || a
}

function fmt(t: string) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

onMounted(async () => {
  try {
    const { data } = await http.get<AdminStats>('/admin/stats', { silent: true })
    stats.value = data
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h2 class="section-title"><el-icon><Odometer /></el-icon>后台概览</h2>

    <div v-if="loading">
      <el-skeleton :rows="5" animated />
    </div>
    <template v-else-if="stats">
      <div class="stat-grid">
        <div class="ws-card stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #409eff, #2f54eb)">
            <el-icon><User /></el-icon>
          </div>
          <div>
            <div class="stat-num">{{ stats.users }}</div>
            <div class="stat-label">用户总数</div>
          </div>
        </div>
        <div class="ws-card stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #13c2c2, #0e8a8a)">
            <el-icon><Coin /></el-icon>
          </div>
          <div>
            <div class="stat-num">{{ stats.profiles }}</div>
            <div class="stat-label">VPS 档案总数</div>
          </div>
        </div>
        <div class="ws-card stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #7c3aed, #a855f7)">
            <el-icon><Tickets /></el-icon>
          </div>
          <div>
            <div class="stat-num">{{ stats.todayLogins }}</div>
            <div class="stat-label">今日登录次数</div>
          </div>
        </div>
        <div class="ws-card stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #fa8c16, #faad14)">
            <el-icon><Menu /></el-icon>
          </div>
          <div>
            <div class="stat-num">{{ stats.navs }}</div>
            <div class="stat-label">导航项数量</div>
          </div>
        </div>
      </div>

      <div class="ws-card" style="margin-top: 20px">
        <h3 class="stat-label" style="font-size: 15px; margin: 0 0 14px; color: var(--el-text-color-primary)">
          最近审计日志(累计登录 {{ stats.totalLogins }} 次)
        </h3>
        <el-empty v-if="stats.recentAudits.length === 0" description="暂无日志" :image-size="80" />
        <el-table v-else :data="stats.recentAudits" size="small" style="width: 100%">
          <el-table-column label="时间" width="170">
            <template #default="{ row }: { row: AuditLogItem }">{{ fmt(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="用户" width="120">
            <template #default="{ row }: { row: AuditLogItem }">{{ row.username || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140">
            <template #default="{ row }: { row: AuditLogItem }">
              <el-tag size="small" :type="row.action.includes('FAILED') || row.action.includes('DELETE') ? 'danger' : 'info'" effect="plain">
                {{ actionLabel(row.action) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="详情" min-width="200">
            <template #default="{ row }: { row: AuditLogItem }">{{ row.detail || '-' }}</template>
          </el-table-column>
          <el-table-column label="IP" width="140">
            <template #default="{ row }: { row: AuditLogItem }">{{ row.ip || '-' }}</template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </div>
</template>
