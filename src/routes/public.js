// /api/public/* 公开路由(游客可读)
const express = require('express')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const prisma = require('../db')
const { config } = require('../config')
const { getAllSettings } = require('../services/settings')
const { authLimiter } = require('../middlewares/rateLimit')

const router = express.Router()

/** 站点公开信息:站名/副标题/登录欢迎语/开关/公告/导航/页脚 */
router.get('/site', async (req, res, next) => {
  try {
    const [settings, navs] = await Promise.all([
      getAllSettings(),
      prisma.navItem.findMany({ where: { enabled: true }, orderBy: { sort: 'asc' } }),
    ])
    res.json({
      siteName: settings.siteName || 'WebSSH 管理平台',
      subtitle: settings.subtitle || '',
      logo: settings.logo || '',
      loginWelcome: settings.loginWelcome || '欢迎回来,请登录以继续',
      allowRegister: settings.allowRegister !== 'false',
      allowGuestSsh: settings.allowGuestSsh !== 'false',
      notice: settings.notice || '',
      navs: navs.map((n) => ({
        id: n.id,
        label: n.label,
        url: n.url,
        newWindow: n.newWindow,
      })),
      footer: {
        html: settings.footerHtml || '',
        copyright: settings.footerCopyright || '',
        icp: settings.footerIcp || '',
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 游客临时令牌:用于未登录用户使用"临时 SSH"连接 WebSocket。
 * 短时效(30 分钟)、仅允许 connectTemp,不携带任何用户身份。
 */
router.post('/guest-token', authLimiter, async (req, res, next) => {
  try {
    const settings = await getAllSettings()
    if (settings.allowGuestSsh === 'false') {
      return res.status(403).json({ message: '管理员已关闭临时 SSH 功能' })
    }
    const token = jwt.sign(
      { sub: `guest:${crypto.randomBytes(8).toString('hex')}`, role: 'guest' },
      config.jwtSecret,
      { expiresIn: '30m' }
    )
    res.json({ token, expiresIn: 1800 })
  } catch (err) {
    next(err)
  }
})

module.exports = router
