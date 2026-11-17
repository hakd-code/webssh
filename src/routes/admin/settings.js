// /api/admin/settings 站点设置
const express = require('express')
const { z } = require('zod')
const { audit } = require('../../services/audit')
const { saveSettings, getAllSettings } = require('../../services/settings')
const { sendTestMail } = require('../../services/mailer')
const { getIp } = require('../../utils')

const router = express.Router()

const patchSchema = z.object({
  siteName: z.string().min(1, '网站名不能为空').max(64).optional(),
  subtitle: z.string().max(200).optional(),
  logo: z.string().max(500).optional(),
  loginWelcome: z.string().max(200).optional(),
  notice: z.string().max(2000).optional(),
  allowRegister: z.boolean().optional(),
  allowGuestSsh: z.boolean().optional(),
  smtpHost: z.string().max(255).optional(),
  smtpPort: z.union([z.number().int().min(1).max(65535), z.string().max(5)]).optional(),
  smtpUser: z.string().max(255).optional(),
  smtpPass: z.string().max(255).nullable().optional(),
  smtpFrom: z.string().max(255).optional(),
  smtpFromName: z.string().max(100).optional(),
})

/** 读取全部设置(SMTP 密码不回传,只返回是否已配置) */
router.get('/', async (req, res, next) => {
  try {
    const s = await getAllSettings()
    res.json({
      siteName: s.siteName || '',
      subtitle: s.subtitle || '',
      logo: s.logo || '',
      loginWelcome: s.loginWelcome || '',
      notice: s.notice || '',
      allowRegister: s.allowRegister !== 'false',
      allowGuestSsh: s.allowGuestSsh !== 'false',
      smtpHost: s.smtpHost || '',
      smtpPort: s.smtpPort || '465',
      smtpUser: s.smtpUser || '',
      smtpFrom: s.smtpFrom || '',
      smtpFromName: s.smtpFromName || '',
      smtpPassSet: Boolean((s.smtpPass || '').trim()),
    })
  } catch (err) {
    next(err)
  }
})

router.patch('/', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body)
    const entries = {}
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue
      if (key === 'smtpPass') {
        // null=清除;'' 或缺省=保留不动
        if (value === null) entries.smtpPass = ''
        continue
      }
      entries[key] = typeof value === 'boolean' ? String(value) : String(value)
    }
    if (Object.keys(entries).length > 0) {
      await saveSettings(entries)
    }
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_UPDATE_SETTINGS',
      detail: `更新站点设置:${Object.keys(entries).join(', ') || '无变更'}`,
      ip: getIp(req),
    })
    res.json({ message: '保存成功', updated: Object.keys(entries) })
  } catch (err) {
    next(err)
  }
})

/** 发送测试邮件 */
router.post('/test-smtp', async (req, res, next) => {
  try {
    const to = z.string().email('收件邮箱格式不正确').parse((req.body || {}).to)
    await sendTestMail(to)
    await audit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ADMIN_TEST_SMTP',
      detail: `发送测试邮件到 ${to}`,
      ip: getIp(req),
    })
    res.json({ message: `测试邮件已发送至 ${to},请查收` })
  } catch (err) {
    if (err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(400).json({ message: err.message })
    }
    next(err)
  }
})

module.exports = router
