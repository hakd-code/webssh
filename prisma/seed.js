/* eslint-disable */
// 种子数据:默认 admin 账户、站点设置、默认导航
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const DEFAULT_SETTINGS = {
  siteName: 'WebSSH 管理平台',
  subtitle: '浏览器里的云端终端,随时随地管理你的服务器',
  logo: '',
  loginWelcome: '欢迎回来,请登录以继续',
  allowRegister: 'true',
  allowGuestSsh: 'true',
  notice: '本平台仅供学习与内部运维使用,请妥善保管服务器凭据,勿用于任何非法用途。',
  footerHtml:
    '<p>WebSSH 在线服务器管理平台 · 基于 xterm.js 与 ssh2 构建,让运维更简单</p>',
  footerCopyright: '© 2026 WebSSH Platform',
  footerIcp: '',
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpFromName: 'WebSSH 管理平台',
}

const DEFAULT_NAVS = [
  { label: '首页', url: '/', sort: 0, enabled: true, newWindow: false },
  { label: '我的 VPS', url: '/profiles', sort: 1, enabled: true, newWindow: false },
  { label: '临时 SSH', url: '/quick-ssh', sort: 2, enabled: true, newWindow: false },
  { label: '项目主页', url: 'https://github.com/', sort: 3, enabled: true, newWindow: true },
]

async function main() {
  // ---- 默认管理员 ----
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@example.com',
        passwordHash: bcrypt.hashSync('Admin@123456', 10),
        role: 'admin',
        status: 'active',
        theme: 'system',
      },
    })
    console.log('[seed] 已创建默认管理员:admin / Admin@123456')
  } else {
    console.log('[seed] 管理员账户已存在,跳过')
  }

  // ---- 默认站点设置 ----
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    })
  }
  console.log('[seed] 站点默认设置已就绪')

  // ---- 默认导航 ----
  const navCount = await prisma.navItem.count()
  if (navCount === 0) {
    for (const nav of DEFAULT_NAVS) {
      await prisma.navItem.create({ data: nav })
    }
    console.log('[seed] 已创建默认导航 4 项')
  } else {
    console.log('[seed] 导航已存在,跳过')
  }

  console.log('[seed] 完成')
}

main()
  .catch((e) => {
    console.error('[seed] 失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
