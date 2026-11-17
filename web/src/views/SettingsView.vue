<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import type { ThemeMode } from '@/api/types'

const auth = useAuthStore()
const theme = useThemeStore()

const pwdLoading = ref(false)
const emailLoading = ref(false)
const pwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirm: '',
})
const email = ref('')

onMounted(() => {
  if (auth.user) {
    email.value = auth.user.email
  }
})

async function onChangePassword() {
  if (!pwdForm.currentPassword || !pwdForm.newPassword) {
    ElMessage.warning('请填写完整密码信息')
    return
  }
  if (pwdForm.newPassword.length < 8 || !/[A-Za-z]/.test(pwdForm.newPassword) || !/[0-9]/.test(pwdForm.newPassword)) {
    ElMessage.warning('新密码至少 8 位,且需包含字母和数字')
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  pwdLoading.value = true
  try {
    const { data } = await http.patch('/auth/me', {
      currentPassword: pwdForm.currentPassword,
      newPassword: pwdForm.newPassword,
    })
    auth.applyReissuedToken(data.token)
    pwdForm.currentPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirm = ''
    ElMessage.success('密码修改成功,其他设备已自动下线')
  } catch {
    /* 拦截器提示 */
  } finally {
    pwdLoading.value = false
  }
}

async function onChangeEmail() {
  if (!email.value || email.value === auth.user?.email) {
    ElMessage.info('邮箱未变化')
    return
  }
  emailLoading.value = true
  try {
    const { data } = await http.patch('/auth/me', { email: email.value })
    auth.user = data.user
    ElMessage.success('邮箱已更新')
  } catch {
    /* 拦截器提示 */
  } finally {
    emailLoading.value = false
  }
}

function onThemeChange(mode: ThemeMode) {
  theme.setMode(mode, true)
}

function fmt(t?: string | null) {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '暂无'
}
</script>

<template>
  <div class="page settings-page">
    <h2 class="section-title"><el-icon><Setting /></el-icon>个人设置</h2>

    <el-row :gutter="20">
      <el-col :xs="24" :md="12">
        <!-- 外观 -->
        <div class="ws-card" style="margin-bottom: 20px">
          <h3 class="card-title">外观偏好</h3>
          <p class="card-desc">选择界面主题,登录后此偏好会同步保存到你的账户。</p>
          <el-radio-group :model-value="theme.mode" size="large" @update:model-value="onThemeChange($event as ThemeMode)">
            <el-radio-button value="light">
              <el-icon style="margin-right: 4px; vertical-align: -2px"><Sunny /></el-icon>亮色
            </el-radio-button>
            <el-radio-button value="dark">
              <el-icon style="margin-right: 4px; vertical-align: -2px"><Moon /></el-icon>暗色
            </el-radio-button>
            <el-radio-button value="system">
              <el-icon style="margin-right: 4px; vertical-align: -2px"><Monitor /></el-icon>跟随系统
            </el-radio-button>
          </el-radio-group>
        </div>

        <!-- 账户信息 -->
        <div class="ws-card" style="margin-bottom: 20px">
          <h3 class="card-title">账户信息</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="用户名">{{ auth.user?.username }}</el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag :type="auth.user?.role === 'admin' ? 'danger' : 'primary'" size="small">
                {{ auth.user?.role === 'admin' ? '管理员' : '普通用户' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ fmt(auth.user?.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="最后登录">{{ fmt(auth.user?.lastLoginAt) }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>

      <el-col :xs="24" :md="12">
        <!-- 修改邮箱 -->
        <div class="ws-card" style="margin-bottom: 20px">
          <h3 class="card-title">修改邮箱</h3>
          <el-input v-model="email" placeholder="注册邮箱" style="margin-bottom: 12px">
            <template #prefix><el-icon><Message /></el-icon></template>
          </el-input>
          <el-button type="primary" :loading="emailLoading" @click="onChangeEmail">保存邮箱</el-button>
        </div>

        <!-- 修改密码 -->
        <div class="ws-card">
          <h3 class="card-title">修改密码</h3>
          <p class="card-desc">修改成功后所有已登录设备(含终端连接)将立即失效。</p>
          <el-form label-position="top" @submit.prevent="onChangePassword">
            <el-form-item label="当前密码">
              <el-input v-model="pwdForm.currentPassword" type="password" show-password placeholder="当前密码" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 8 位,含字母和数字" />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" @keyup.enter="onChangePassword" />
            </el-form-item>
            <el-button type="primary" :loading="pwdLoading" @click="onChangePassword">修改密码</el-button>
          </el-form>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.card-title {
  margin: 0 0 8px;
  font-size: 16px;
}

.card-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0 0 14px;
}
</style>
