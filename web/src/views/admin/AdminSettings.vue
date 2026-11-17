<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()
const loading = ref(true)
const saving = ref(false)

const form = reactive({
  siteName: '',
  subtitle: '',
  logo: '',
  loginWelcome: '',
  notice: '',
  allowRegister: true,
  allowGuestSsh: true,
  // SMTP
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpFromName: '',
  smtpPassSet: false,
})

const testDialogVisible = ref(false)
const testTo = ref('')
const testing = ref(false)

onMounted(async () => {
  try {
    const { data } = await http.get('/admin/settings', { silent: true })
    Object.assign(form, data)
  } finally {
    loading.value = false
  }
})

async function saveBasic() {
  if (!form.siteName.trim()) {
    ElMessage.warning('网站名不能为空')
    return
  }
  saving.value = true
  try {
    await http.patch('/admin/settings', {
      siteName: form.siteName.trim(),
      subtitle: form.subtitle,
      logo: form.logo,
      loginWelcome: form.loginWelcome,
      notice: form.notice,
      allowRegister: form.allowRegister,
      allowGuestSsh: form.allowGuestSsh,
    })
    ElMessage.success('基础设置已保存')
    site.invalidate()
    await site.fetchSite(true)
  } catch {
    /* 拦截器提示 */
  } finally {
    saving.value = false
  }
}

async function saveSmtp() {
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      smtpHost: form.smtpHost.trim(),
      smtpPort: form.smtpPort,
      smtpUser: form.smtpUser.trim(),
      smtpFrom: form.smtpFrom.trim(),
      smtpFromName: form.smtpFromName,
    }
    if (form.smtpPass) payload.smtpPass = form.smtpPass // 留空 = 保留原密码
    await http.patch('/admin/settings', payload)
    ElMessage.success('SMTP 配置已保存')
    form.smtpPass = ''
    await reload()
  } catch {
    /* 拦截器提示 */
  } finally {
    saving.value = false
  }
}

async function reload() {
  const { data } = await http.get('/admin/settings', { silent: true })
  Object.assign(form, data)
}

async function sendTest() {
  if (!testTo.value) {
    ElMessage.warning('请填写测试收件邮箱')
    return
  }
  testing.value = true
  try {
    const { data } = await http.post('/admin/settings/test-smtp', { to: testTo.value })
    ElMessage.success(data.message || '测试邮件已发送')
    testDialogVisible.value = false
  } catch (err: any) {
    // SMTP 未配置等友好错误由拦截器提示
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="section-title"><el-icon><Setting /></el-icon>站点设置</h2>

    <div v-if="loading"><el-skeleton :rows="8" animated /></div>
    <template v-else>
      <!-- 基础设置 -->
      <div class="ws-card" style="margin-bottom: 20px">
        <h3 class="group-title">基础信息</h3>
        <el-form label-position="top">
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="网站名(浏览器标题 + 顶栏 Logo)">
                <el-input v-model="form.siteName" placeholder="WebSSH 管理平台" maxlength="64" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="网站副标题">
                <el-input v-model="form.subtitle" placeholder="一句话介绍" maxlength="200" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="登录页欢迎语">
                <el-input v-model="form.loginWelcome" maxlength="200" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="首页公告(可留空)">
                <el-input v-model="form.notice" maxlength="2000" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="Logo 文字 / 图片地址(可留空)">
            <el-input v-model="form.logo" placeholder="留空则显示网站名" maxlength="500" />
          </el-form-item>
          <el-form-item label="注册开关">
            <el-switch v-model="form.allowRegister" active-text="开放注册" inactive-text="关闭注册" />
          </el-form-item>
          <el-form-item label="游客临时 SSH 开关">
            <el-switch v-model="form.allowGuestSsh" active-text="允许游客使用临时 SSH" inactive-text="禁止游客临时 SSH" />
          </el-form-item>
          <el-button type="primary" :loading="saving" @click="saveBasic">保存基础设置</el-button>
        </el-form>
      </div>

      <!-- SMTP -->
      <div class="ws-card">
        <h3 class="group-title">SMTP 邮件配置(用于发送密码重置邮件)</h3>
        <el-form label-position="top">
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="SMTP 主机">
                <el-input v-model="form.smtpHost" placeholder="如 smtp.example.com,留空表示未配置" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="SMTP 端口">
                <el-input v-model="form.smtpPort" placeholder="465(SSL)/ 587(STARTTLS)" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="SMTP 账号">
                <el-input v-model="form.smtpUser" placeholder="登录账号" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="SMTP 授权码 / 密码">
                <el-input
                  v-model="form.smtpPass"
                  type="password"
                  show-password
                  :placeholder="form.smtpPassSet ? '已配置,留空表示保留不修改' : '授权码 / 密码'"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="发件人邮箱">
                <el-input v-model="form.smtpFrom" placeholder="留空则使用 SMTP 账号" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="发件人名称">
                <el-input v-model="form.smtpFromName" placeholder="WebSSH 管理平台" />
              </el-form-item>
            </el-col>
          </el-row>
          <div style="display: flex; gap: 12px; flex-wrap: wrap">
            <el-button type="primary" :loading="saving" @click="saveSmtp">保存 SMTP 配置</el-button>
            <el-button @click="testDialogVisible = true">发送测试邮件</el-button>
          </div>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="SMTP 未配置时,密码重置链接会打印到服务端日志(pino),可从日志中获取。"
            style="margin-top: 14px"
          />
        </el-form>
      </div>
    </template>

    <!-- 测试邮件弹窗 -->
    <el-dialog v-model="testDialogVisible" title="发送测试邮件" width="420px">
      <el-input v-model="testTo" placeholder="接收测试邮件的邮箱地址" @keyup.enter="sendTest" />
      <template #footer>
        <el-button @click="testDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="testing" @click="sendTest">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.group-title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
}
</style>
