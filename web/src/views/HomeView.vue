<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import { useAuthStore } from '@/stores/auth'

const site = useSiteStore()
const auth = useAuthStore()
const router = useRouter()

const features = [
  { icon: 'Monitor', title: '浏览器即终端', desc: '无需安装任何客户端,打开网页即可获得完整交互式 Shell,支持 vim、htop 等全屏程序。' },
  { icon: 'Lock', title: '凭据加密存储', desc: '密码与私钥使用 AES-256-GCM 加密落库,API 永不回传明文,编辑时可选择"保留不修改"。' },
  { icon: 'Connection', title: '一键快速连接', desc: '保存 VPS 连接档案,下次点击即连,免去重复输入主机、端口与凭据。' },
  { icon: 'Folder', title: '多标签工作台', desc: '同时打开多个 SSH 会话,标签间自由切换,断线自动提示可重连。' },
  { icon: 'Sunny', title: '明暗主题', desc: '亮色 / 暗色 / 跟随系统三态切换,终端配色随全局主题联动。' },
  { icon: 'Pointer', title: '游客临时连接', desc: '未登录也能手输信息直连服务器,凭据仅存于当前页面,关闭即丢弃。' },
]

const stats = computed(() => ({
  registerOpen: site.info.allowRegister,
  guestOpen: site.info.allowGuestSsh,
}))
</script>

<template>
  <div class="page">
    <!-- Hero -->
    <section class="hero">
      <h1>{{ site.info.siteName }}</h1>
      <p>{{ site.info.subtitle || '基于浏览器的 WebSSH 在线服务器管理平台,随时随地安全连接你的 VPS。' }}</p>
      <div class="hero-actions">
        <template v-if="!auth.isLoggedIn">
          <el-button type="primary" size="large" round @click="router.push('/register')">免费注册</el-button>
          <el-button size="large" round class="hero-ghost" @click="router.push('/login')">立即登录</el-button>
        </template>
        <template v-else>
          <el-button type="primary" size="large" round @click="router.push('/profiles')">我的 VPS</el-button>
          <el-button size="large" round class="hero-ghost" @click="router.push('/terminal')">终端工作台</el-button>
        </template>
        <el-button
          v-if="stats.guestOpen"
          size="large"
          round
          class="hero-ghost"
          @click="router.push('/quick-ssh')"
        >
          临时 SSH 直连
        </el-button>
      </div>
    </section>

    <!-- 公告 -->
    <el-alert
      v-if="site.info.notice"
      :title="site.info.notice"
      type="info"
      show-icon
      :closable="false"
      style="margin-top: 20px"
    />

    <!-- 特性 -->
    <section style="margin-top: 36px">
      <h2 class="section-title"><el-icon><Grid /></el-icon>平台特性</h2>
      <div class="ws-card feature-grid">
        <div v-for="f in features" :key="f.title" class="feature-item">
          <div class="feature-icon"><el-icon><component :is="f.icon" /></el-icon></div>
          <div>
            <h4>{{ f.title }}</h4>
            <p>{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 使用步骤 -->
    <section style="margin-top: 32px">
      <h2 class="section-title"><el-icon><Guide /></el-icon>三步开始</h2>
      <el-row :gutter="16">
        <el-col :xs="24" :sm="8">
          <div class="ws-card ws-card--hover step-card">
            <div class="step-num">1</div>
            <h4>注册账户</h4>
            <p>{{ stats.registerOpen ? '创建你的账户,所有连接档案私有存储、与其他用户完全隔离。' : '本站暂未开放注册,可使用游客临时 SSH 或联系管理员。' }}</p>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="ws-card ws-card--hover step-card">
            <div class="step-num">2</div>
            <h4>添加 VPS 档案</h4>
            <p>填入主机、端口、登录用户与密码/密钥,凭据全程加密,永不回传明文。</p>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="ws-card ws-card--hover step-card">
            <div class="step-num">3</div>
            <h4>一键连接终端</h4>
            <p>点击"连接"即刻进入交互式 Shell,支持中文、全彩与多标签并行。</p>
          </div>
        </el-col>
      </el-row>
    </section>
  </div>
</template>

<style scoped>
.hero-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-ghost {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
  backdrop-filter: blur(4px);
}

.hero-ghost:hover {
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
}

.step-card {
  height: 100%;
}

.step-num {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #409eff, #6366f1);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.step-card h4 {
  margin: 0 0 8px;
  font-size: 15px;
}

.step-card p {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}
</style>
