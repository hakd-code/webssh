<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import http from '@/api/http'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)
const sent = ref(false)
const form = reactive({ email: '' })

const rules: FormRules = {
  email: [
    { required: true, message: '请输入注册邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await http.post('/auth/forgot-password', { email: form.email })
    sent.value = true
    ElMessage.success('提交成功')
  } catch {
    /* 错误由拦截器统一提示 */
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <template v-if="!sent">
        <h2>忘记密码</h2>
        <p class="auth-sub">输入注册邮箱,我们将发送密码重置链接</p>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="注册邮箱" prop="email">
            <el-input v-model="form.email" placeholder="you@example.com" size="large" @keyup.enter="onSubmit">
              <template #prefix><el-icon><Message /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="onSubmit">
            发送重置邮件
          </el-button>
        </el-form>
        <div class="auth-foot">
          <router-link to="/login">返回登录</router-link>
        </div>
      </template>
      <template v-else>
        <el-result icon="success" title="邮件已提交发送" sub-title="如邮箱存在,重置邮件已发送,请查收(注意垃圾邮件箱)。链接 15 分钟内有效且仅可使用一次。">
          <template #extra>
            <el-button type="primary" @click="router.push('/login')">返回登录</el-button>
            <el-button @click="sent = false">重新发送</el-button>
          </template>
        </el-result>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="提示:若站点尚未配置 SMTP,重置链接会打印在服务端运行日志中,请联系管理员获取。"
          style="margin-top: 12px"
        />
      </template>
    </div>
  </div>
</template>
