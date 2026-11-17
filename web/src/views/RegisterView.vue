<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'

const auth = useAuthStore()
const site = useSiteStore()
const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({
  username: '',
  email: '',
  password: '',
  confirm: '',
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_]{3,32}$/,
      message: '3-32 位字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
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
    await auth.register({ username: form.username, email: form.email, password: form.password })
    ElMessage.success('注册成功,已自动登录')
    router.push('/profiles')
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
      <template v-if="site.info.allowRegister">
        <h2>注册账户</h2>
        <p class="auth-sub">注册后可保存 VPS 连接档案,一键连接服务器</p>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="3-32 位字母/数字/下划线" size="large">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="用于找回密码" size="large">
              <template #prefix><el-icon><Message /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" placeholder="至少 8 位,含字母和数字" size="large" show-password>
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="确认密码" prop="confirm">
            <el-input v-model="form.confirm" type="password" placeholder="再次输入密码" size="large" show-password @keyup.enter="onSubmit">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="onSubmit">
            注 册
          </el-button>
        </el-form>
        <div class="auth-foot">
          <span>已有账户?</span>
          <router-link to="/login">直接登录</router-link>
        </div>
      </template>
      <template v-else>
        <el-result icon="warning" title="暂未开放注册" sub-title="本站当前关闭了注册入口,请使用游客临时 SSH 或联系管理员开通账户。">
          <template #extra>
            <el-button type="primary" @click="router.push('/quick-ssh')">使用临时 SSH</el-button>
            <el-button @click="router.push('/login')">返回登录</el-button>
          </template>
        </el-result>
      </template>
    </div>
  </div>
</template>
