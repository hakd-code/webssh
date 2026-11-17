// 环境变量与密钥加载(首次启动自动从项目根 .env.example 复制生成根目录 .env)
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const dotenv = require('dotenv')

// src/ 位于项目根下,项目根即 webssh/ 目录
const appRoot = path.resolve(__dirname, '..')

const envPath = path.join(appRoot, '.env')
const envExamplePath = path.join(appRoot, '.env.example')

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath)
  // eslint-disable-next-line no-console
  console.log('[config] 未找到 .env,已自动从 .env.example 复制生成(生产环境请修改密钥)')
}
dotenv.config({ path: envPath })

const config = {
  port: Number(process.env.PORT || 3112),
  jwtSecret: process.env.JWT_SECRET || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  appUrl: (process.env.APP_URL || '').trim(),
  logLevel: process.env.LOG_LEVEL || 'info',
  isProd: process.env.NODE_ENV === 'production',
  appRoot,
  distDir: path.resolve(appRoot, 'dist'),
}

// JWT 密钥兜底(仅限开发):给出明确告警
if (!config.jwtSecret) {
  config.jwtSecret = crypto
    .createHash('sha256')
    .update('webssh-dev-fallback-jwt-secret')
    .digest('hex')
  // eslint-disable-next-line no-console
  console.warn('[config] 警告: 未设置 JWT_SECRET,当前使用开发兜底密钥,生产环境必须配置!')
}

// 加密密钥兜底(仅限开发):必须为 64 个 hex 字符(32 字节)
if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey || '')) {
  config.encryptionKey = crypto
    .createHash('sha256')
    .update('webssh-dev-fallback-encryption-key')
    .digest('hex')
  // eslint-disable-next-line no-console
  console.warn(
    '[config] 警告: 未设置 ENCRYPTION_KEY 或格式不正确(需 32 字节 hex),当前使用开发兜底密钥,历史凭据将不可解密!'
  )
}

module.exports = { config }
