// 审计日志服务
const prisma = require('../db')
const logger = require('../logger')

/**
 * 写入审计日志(失败仅记录告警,不影响主流程)
 * @param {{userId?: string|null, username?: string|null, action: string, detail?: string|null, ip?: string|null}} entry
 */
async function audit(entry) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId || null,
        username: entry.username || null,
        action: entry.action,
        detail: entry.detail ? String(entry.detail).slice(0, 2000) : null,
        ip: entry.ip || null,
      },
    })
  } catch (err) {
    logger.warn({ err: err.message, action: entry.action }, '写入审计日志失败')
  }
}

module.exports = { audit }
