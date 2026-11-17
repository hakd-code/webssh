<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import http from '@/api/http'

const route = useRoute()
const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)
const done = ref(false)
const token = computed(() => String(route.query.token || ''))

const form = reactive({
  password: '',
  confirm: '',
})

const rules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        if (!v) return cb()
        if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) cb(new Error('密码须同时包含字母和数字'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        if (v !== form.password) cb(new Error('两次输入的密码不一致'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await http.post('/auth/reset-password', { token: token.value, newPassword: form.password })
    done.value = true
    ElMessage.success('密码重置成功')
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
      <template v-if="!token">
        <el-result icon="error" title="链接无效" sub-title="重置链接缺少令牌参数,请从邮件中的链接打开本页面。">
          <template #extra>
            <el-button type="primary" @click="router.push('/forgot-password')">重新申请</el-button>
          </template>
        </el-result>
      </template>
      <template v-else-if="!done">
        <h2>设置新密码</h2>
        <p class="auth-sub">请输入新密码,重置成功后所有旧登录将立即失效</p>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="新密码" prop="password">
            <el-input v-model="form.password" type="password" placeholder="至少 8 位,含字母和数字" size="large" show-password>
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirm">
            <el-input v-model="form.confirm" type="password" placeholder="再次输入新密码" size="large" show-password @keyup.enter="onSubmit">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="onSubmit">
            重置密码
          </el-button>
        </el-form>
      </template>
      <template v-else>
        <el-result icon="success" title="密码已重置" sub-title="请使用新密码重新登录,所有旧登录状态已失效。">
          <template #extra>
            <el-button type="primary" @click="router.push('/login')">去登录</el-button>
          </template>
        </el-result>
      </template>
    </div>
  </div>
</template>
