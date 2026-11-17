// 邮件服务(nodemailer)
const nodemailer = require('nodemailer')
const logger = require('../logger')
const { getAllSettings } = require('./settings')

/** 从站点设置构建 SMTP transporter;未配置返回 null */
async function buildTransporter() {
  const s = await getAllSettings()
  const host = (s.smtpHost || '').trim()
  if (!host) return null
  const port = Number(s.smtpPort || 465) || 465
  const user = (s.smtpUser || '').trim()
  const pass = s.smtpPass || ''
  const from = (s.smtpFrom || user || '').trim()
  const fromName = (s.smtpFromName || 'WebSSH 管理平台').trim()

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  })
  transporter._from = fromName ? `${fromName} <${from}>` : from
  return transporter
}

/** SMTP 是否已配置 */
async function isSmtpConfigured() {
  const s = await getAllSettings()
  return Boolean((s.smtpHost || '').trim())
}

/** 发送密码重置邮件 */
async function sendResetMail(to, resetUrl) {
  const transporter = await buildTransporter()
  if (!transporter) {
    logger.warn({ to }, 'SMTP 未配置,跳过发送重置邮件')
    return false
  }
  const siteName = (await getAllSettings()).siteName || 'WebSSH 管理平台'
  await transporter.sendMail({
    from: transporter._from,
    to,
    subject: `${siteName} - 密码重置`,
    html: [
      `<p>您好,</p>`,
      `<p>我们收到了您在 <strong>${siteName}</strong> 的密码重置请求。请点击以下链接设置新密码:</p>`,
      `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
      `<p>链接 15 分钟内有效且仅可使用一次。若非本人操作,请忽略本邮件。</p>`,
    ].join('\n'),
  })
  return true
}

/** 发送测试邮件 */
async function sendTestMail(to) {
  const transporter = await buildTransporter()
  if (!transporter) {
    const err = new Error('SMTP 尚未配置,请先填写 SMTP 主机、端口与账号信息')
    err.code = 'SMTP_NOT_CONFIGURED'
    throw err
  }
  const siteName = (await getAllSettings()).siteName || 'WebSSH 管理平台'
  const info = await transporter.sendMail({
    from: transporter._from,
    to,
    subject: `${siteName} - SMTP 测试邮件`,
    text: '这是一封来自 WebSSH 管理平台的测试邮件,收到即说明 SMTP 配置正确。',
    html: '<p>这是一封来自 <strong>WebSSH 管理平台</strong> 的测试邮件,收到即说明 SMTP 配置正确。</p>',
  })
  logger.info({ messageId: info.messageId, to }, '测试邮件已发送')
  return info
}

module.exports = { buildTransporter, isSmtpConfigured, sendResetMail, sendTestMail }
