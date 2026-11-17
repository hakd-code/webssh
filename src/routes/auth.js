// /api/auth/* 认证路由
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const { config } = require('../config')
const prisma = require('../db')
const logger = require('../logger')
const { requireAuth } = require('../middlewares/auth')
const {
  authLimiter,
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  remainingLoginAttempts,
} = require('../middlewares/rateLimit')
const { audit } = require('../services/audit')
const { sendResetMail, isSmtpConfigured } = require('../services/mailer')
const { getAllSettings } = require('../services/settings')
const { getIp, sha256Hex, randomToken } = require('../utils')

const router = express.Router()

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    theme: user.theme,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, tv: user.tokenVersion },
    config.jwtSecret,
    { expiresIn: '7d' }
  )
}

const registerSchema = z.object({
  username: z
    .string()
    .regex(/^[A-Za-z0-9_]{3,32}$/, '用户名须为 3-32 位字母/数字/下划线'),
  email: z.string().email('邮箱格式不正确').max(255),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(72)
    .regex(/[A-Za-z]/, '密码须包含字母')
    .regex(/[0-9]/, '密码须包含数字'),
})

const loginSchema = z.object({
  account: z.string().min(1, '请输入用户名或邮箱').max(255),
  password: z.string().min(1, '请输入密码').max(72),
  rememberMe: z.boolean().optional().default(false),
})

const forgotSchema = z.object({ email: z.string().email().max(255) })
const resetSchema = z.object({
  token: z.string().min(16).max(128),
  newPassword: z
    .string()
    .min(8, '密码至少 8 位')
    .max(72)
    .regex(/[A-Za-z]/, '密码须包含字母')
    .regex(/[0-9]/, '密码须包含数字'),
})
const patchMeSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  email: z.string().email('邮箱格式不正确').max(255).optional(),
  currentPassword: z.string().max(72).optional(),
  newPassword: z
    .string()
    .min(8, '密码至少 8 位')
    .max(72)
    .regex(/[A-Za-z]/, '密码须包含字母')
    .regex(/[0-9]/, '密码须包含数字')
    .optional(),
})

// ---------------- 注册 ----------------
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body)
    const allowRegister = (await getAllSettings()).allowRegister !== 'false'
    if (!allowRegister) {
      return res.status(403).json({ message: '本站暂未开放注册,请联系管理员' })
    }
    const exists = await prisma.user.findFirst({
      where: { OR: [{ username: body.username }, { email: body.email.toLowerCase() }] },
    })
    if (exists) {
      const field = exists.username === body.username ? '用户名' : '邮箱'
      return res.status(409).json({ message: `${field}已被使用` })
    }
    const user = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email.toLowerCase(),
        passwordHash: bcrypt.hashSync(body.password, 10),
        role: 'user',
        status: 'active',
      },
    })
    await audit({
      userId: user.id,
      username: user.username,
      action: 'REGISTER',
      detail: '新用户注册',
      ip: getIp(req),
    })
    const token = signToken(user)
    res.status(201).json({ token, user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

// ---------------- 登录 ----------------
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body)
    const ip = getIp(req)
    const lock = checkLoginAllowed(ip, body.account)
    if (!lock.allowed) {
      const minutes = Math.ceil(lock.retryAfterSec / 60)
      return res.status(429).json({
        message: `登录失败次数过多,账户已临时锁定,请约 ${minutes} 分钟后再试`,
        retryAfterSec: lock.retryAfterSec,
      })
    }
    const account = body.account.toLowerCase()
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: body.account }, { email: account }] },
    })
    const ok = user && bcrypt.compareSync(body.password, user.passwordHash)
    if (!ok) {
      recordLoginFailure(ip, body.account)
      const remaining = remainingLoginAttempts(ip, body.account)
      await audit({
        userId: user ? user.id : null,
        username: body.account,
        action: 'LOGIN_FAILED',
        detail: '登录失败(凭据错误或账户不存在)',
        ip,
      })
      return res.status(401).json({
        message: user
          ? `用户名或密码错误(15 分钟内连续失败 5 次将锁定,还可尝试 ${remaining} 次)`
          : '用户名或密码错误',
      })
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: '账户已被禁用,请联系管理员' })
    }
    clearLoginFailures(ip, body.account)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    await audit({
      userId: user.id,
      username: user.username,
      action: 'LOGIN',
      detail: '登录成功',
      ip,
    })
    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role, tv: user.tokenVersion },
      config.jwtSecret,
      { expiresIn: body.rememberMe ? '30d' : '7d' }
    )
    res.json({ token, user: publicUser(updated) })
  } catch (err) {
    next(err)
  }
})

// ---------------- 忘记密码 ----------------
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const body = forgotSchema.parse(req.body)
    const email = body.email.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email } })
    const GENERIC_MSG = '如邮箱存在,重置邮件已发送,请查收(注意垃圾邮件箱)'

    if (user) {
      // 作废旧的未使用 token
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      const token = randomToken()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt },
      })
      const origin = config.appUrl || req.headers.origin || `${req.protocol}://${req.get('host')}`
      const resetUrl = `${origin}/reset-password?token=${token}`
      const smtpOk = await isSmtpConfigured()
      if (smtpOk) {
        try {
          await sendResetMail(email, resetUrl)
          await audit({ userId: user.id, username: user.username, action: 'FORGOT_PASSWORD', detail: '重置邮件已发送', ip: getIp(req) })
        } catch (err) {
          logger.error({ err: err.message }, '重置邮件发送失败')
          // 发送失败同样把链接写入日志兜底
          logger.warn({ resetUrl }, '[SMTP 发送失败兜底] 密码重置链接(15 分钟有效):')
        }
      } else {
        // SMTP 未配置:把重置 URL 打到服务端日志(README 有说明)
        logger.warn({ resetUrl }, '[SMTP 未配置兜底] 密码重置链接(15 分钟有效,单次使用):')
        await audit({ userId: user.id, username: user.username, action: 'FORGOT_PASSWORD', detail: 'SMTP 未配置,重置链接已写入服务端日志', ip: getIp(req) })
      }
    }
    res.json({ message: GENERIC_MSG })
  } catch (err) {
    next(err)
  }
})

// ---------------- 重置密码 ----------------
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const body = resetSchema.parse(req.body)
    const tokenHash = sha256Hex(body.token)
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: '重置链接无效或已过期,请重新申请' })
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: bcrypt.hashSync(body.newPassword, 10),
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ])
    await audit({
      userId: record.userId,
      username: record.user.username,
      action: 'RESET_PASSWORD',
      detail: '通过邮件令牌重置密码成功,所有旧 JWT 已失效',
      ip: getIp(req),
    })
    res.json({ message: '密码重置成功,请使用新密码登录' })
  } catch (err) {
    next(err)
  }
})

// ---------------- 当前用户 ----------------
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) })
})

// 修改资料 / 密码 / 主题偏好
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const body = patchMeSchema.parse(req.body)
    const user = req.user
    const data = {}
    let reissuedToken = null

    if (body.email && body.email.toLowerCase() !== user.email) {
      const dup = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
      if (dup) return res.status(409).json({ message: '该邮箱已被其他账户使用' })
      data.email = body.email.toLowerCase()
    }
    if (body.theme) data.theme = body.theme

    if (body.newPassword) {
      if (!body.currentPassword) {
        return res.status(400).json({ message: '修改密码需要提供当前密码' })
      }
      if (!bcrypt.compareSync(body.currentPassword, user.passwordHash)) {
        return res.status(400).json({ message: '当前密码不正确' })
      }
      data.passwordHash = bcrypt.hashSync(body.newPassword, 10)
      data.tokenVersion = { increment: 1 } // 使所有旧 JWT 失效
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data })
    if (body.newPassword) {
      reissuedToken = signToken(updated)
      await audit({
        userId: user.id,
        username: user.username,
        action: 'CHANGE_PASSWORD',
        detail: '用户修改密码,旧 JWT 已全部失效',
        ip: getIp(req),
      })
    }
    if (body.theme) {
      await audit({
        userId: user.id,
        username: user.username,
        action: 'UPDATE_PROFILE',
        detail: `更新主题偏好为 ${body.theme}`,
        ip: getIp(req),
      })
    }
    res.json({ user: publicUser(updated), token: reissuedToken })
  } catch (err) {
    next(err)
  }
})

module.exports = router
