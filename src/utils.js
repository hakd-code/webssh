// 通用工具函数
const crypto = require('crypto')

/** 提取客户端真实 IP(兼容反向代理) */
function getIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for']
  let ip = ''
  if (typeof fwd === 'string' && fwd.length > 0) {
    ip = fwd.split(',')[0].trim()
  } else {
    ip = (req.socket && req.socket.remoteAddress) || ''
  }
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7)
  return ip || 'unknown'
}

/** SHA-256 摘要(十六进制) */
function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** 生成 32 字节随机 token(64 个 hex 字符) */
function randomToken() {
  return crypto.randomBytes(32).toString('hex')
}

/** 生成随机密码(用于管理员重置) */
function randomPassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = crypto.randomBytes(len)
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
  return out
}

module.exports = { getIp, sha256Hex, randomToken, randomPassword }
