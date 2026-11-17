// 认证与权限中间件
const jwt = require('jsonwebtoken')
const { config } = require('../config')
const prisma = require('../db')

/** 从请求中提取 Bearer token */
function extractToken(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  const q = req.query && req.query.token
  return typeof q === 'string' && q ? q.trim() : ''
}

/** 必须登录:校验 JWT、tokenVersion、用户状态 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req)
    if (!token) return res.status(401).json({ message: '未登录或登录已过期' })
    const payload = jwt.verify(token, config.jwtSecret)
    if (!payload || !payload.sub) {
      return res.status(401).json({ message: '登录状态无效,请重新登录' })
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return res.status(401).json({ message: '用户不存在或已被删除' })
    if (user.status !== 'active') {
      return res.status(401).json({ message: '账户已被禁用,请联系管理员' })
    }
    if (typeof payload.tv !== 'number' || payload.tv !== user.tokenVersion) {
      return res.status(401).json({ message: '登录状态已失效(密码已变更),请重新登录' })
    }
    req.user = user
    req.token = token
    next()
  } catch {
    return res.status(401).json({ message: '登录状态无效,请重新登录' })
  }
}

/** 必须管理员 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' })
  }
  next()
}

module.exports = { requireAuth, requireAdmin, extractToken }
