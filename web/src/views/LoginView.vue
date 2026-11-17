<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'

const auth = useAuthStore()
const site = useSiteStore()
const route = useRoute()
const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({
  account: '',
  password: '',
  rememberMe: false,
})

const rules: FormRules = {
  account: [{ required: true, message: '请输入用户名或邮箱', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await auth.login(form.account, form.password, form.rememberMe)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
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
      <h2>登录</h2>
      <p class="auth-sub">{{ site.info.loginWelcome || '欢迎回来,请登录以继续' }}</p>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="用户名 / 邮箱" prop="account">
          <el-input v-model="form.account" placeholder="用户名或邮箱" size="large" autocomplete="username">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          >
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <div class="login-options">
          <el-checkbox v-model="form.rememberMe">记住我(30 天免登录)</el-checkbox>
          <router-link to="/forgot-password" class="forgot-link">忘记密码?</router-link>
        </div>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="onSubmit">
          登 录
        </el-button>
      </el-form>
      <div class="auth-foot">
        <span>还没有账户?</span>
        <router-link to="/register">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.forgot-link {
  font-size: 13px;
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>
