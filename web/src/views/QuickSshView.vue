<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import http from '@/api/http'
import { useSiteStore } from '@/stores/site'
import { useAuthStore } from '@/stores/auth'
import type { AuthType } from '@/api/types'
import TerminalPane from '@/components/TerminalPane.vue'

const site = useSiteStore()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const connecting = ref(false)
const connected = ref(false)
const guestToken = ref('')
const form = reactive({
  host: '',
  port: 22,
  username: 'root',
  authType: 'password' as AuthType,
  password: '',
  privateKey: '',
  passphrase: '',
})

const rules: FormRules = {
  host: [{ required: true, message: '请输入主机地址(IP 或域名)', trigger: 'blur' }],
  port: [{ required: true, message: '请输入端口', trigger: 'blur' }],
  username: [{ required: true, message: '请输入 SSH 登录用户', trigger: 'blur' }],
  password: [
    {
      validator: (_r, v: string, cb) => {
        if (form.authType === 'password' && !v) cb(new Error('请输入密码'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  privateKey: [
    {
      validator: (_r, v: string, cb) => {
        if (form.authType === 'privateKey' && !v) cb(new Error('请输入私钥内容(OpenSSH PEM 格式)'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

onMounted(() => {
  site.fetchSite()
})

/** 获取 WS 访问令牌:已登录用户直接用登录 token;游客申请短时效游客令牌 */
async function resolveToken(): Promise<boolean> {
  if (auth.token) return true
  try {
    const { data } = await http.post('/public/guest-token', {}, { silent: true })
    guestToken.value = data.token
    return true
  } catch (err: any) {
    if (err?.response?.status === 403) {
      ElMessage.warning('管理员已关闭临时 SSH 功能')
    }
    return false
  }
}

async function onConnect() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  connecting.value = true
  const ok = await resolveToken()
  connecting.value = false
  if (!ok) return
  connected.value = true
}

function onReset() {
  connected.value = false
  guestToken.value = ''
  formRef.value?.resetFields()
}
</script>

<template>
  <div :class="connected ? 'page page--full quick-page' : 'page'">
    <template v-if="!site.info.allowGuestSsh">
      <el-result
        icon="warning"
        title="临时 SSH 功能已关闭"
        sub-title="管理员已在站点设置中关闭游客临时 SSH,请登录后使用个人档案连接。"
      >
        <template #extra>
          <el-button type="primary" @click="$router.push('/login')">去登录</el-button>
        </template>
      </el-result>
    </template>

    <template v-else>
      <div class="quick-header">
        <h2 class="section-title" style="margin-bottom: 4px">
          <el-icon><Connection /></el-icon>临时 SSH 直连
        </h2>
        <p class="quick-tip">
          手动输入服务器信息直接连接,凭据<b>仅保存在当前页面内存</b>,不写入数据库、不产生任何持久化,页面关闭即丢弃。
        </p>
      </div>

      <el-row :gutter="20">
        <el-col :xs="24" :md="connected ? 8 : 24" :lg="connected ? 7 : 24">
          <div class="ws-card">
            <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onConnect">
              <el-row :gutter="12">
                <el-col :span="16">
                  <el-form-item label="主机地址" prop="host">
                    <el-input v-model="form.host" placeholder="IP 或域名" :disabled="connected" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="端口" prop="port">
                    <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" :disabled="connected" />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-form-item label="登录用户" prop="username">
                <el-input v-model="form.username" placeholder="如 root" :disabled="connected" />
              </el-form-item>
              <el-form-item label="认证方式">
                <el-radio-group v-model="form.authType" :disabled="connected">
                  <el-radio-button value="password">密码</el-radio-button>
                  <el-radio-button value="privateKey">私钥</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="form.authType === 'password'" label="密码" prop="password">
                <el-input v-model="form.password" type="password" show-password placeholder="SSH 登录密码" :disabled="connected" @keyup.enter="onConnect" />
              </el-form-item>
              <template v-else>
                <el-form-item label="私钥(OpenSSH PEM)" prop="privateKey">
                  <el-input
                    v-model="form.privateKey"
                    type="textarea"
                    :rows="5"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    :disabled="connected"
                  />
                </el-form-item>
                <el-form-item label="私钥口令(可选)">
                  <el-input v-model="form.passphrase" type="password" show-password placeholder="若私钥加密请填写" :disabled="connected" />
                </el-form-item>
              </template>
              <div style="display: flex; gap: 10px">
                <el-button v-if="!connected" type="primary" size="large" style="flex: 1" :loading="connecting" @click="onConnect">
                  连接终端
                </el-button>
                <el-button v-else type="warning" size="large" style="flex: 1" @click="onReset">
                  关闭并重置
                </el-button>
              </div>
            </el-form>
            <el-alert
              type="warning"
              :closable="false"
              title="频率限制:每 IP 每 10 分钟最多发起 5 次临时连接。"
              style="margin-top: 14px"
            />
          </div>
        </el-col>
        <el-col :xs="24" :md="16" :lg="17">
          <div v-if="connected" class="ws-card quick-terminal-card">
            <TerminalPane
              :temp-params="{
                host: form.host,
                port: form.port,
                username: form.username,
                authType: form.authType,
                password: form.password,
                privateKey: form.privateKey,
                passphrase: form.passphrase,
              }"
              :guest-token="guestToken"
              show-virtual-keys
            />
          </div>
          <div v-else class="ws-card quick-placeholder">
            <el-empty description="填写左侧信息后点击「连接终端」" :image-size="120" />
          </div>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<style scoped>
.quick-page {
  max-width: 1500px;
}

.quick-tip {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0 0 16px;
}

.quick-terminal-card {
  height: calc(100vh - 220px);
  min-height: 420px;
  padding: 8px;
}

.quick-placeholder {
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
