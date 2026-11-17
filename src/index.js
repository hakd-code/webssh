// 入口:Express API + ws 终端 + 静态托管(SPA fallback)
const http = require('http')
const path = require('path')
const fs = require('fs')
const express = require('express')

const { config } = require('./config')
const logger = require('./logger')
const prisma = require('./db')
const { apiLimiter } = require('./middlewares/rateLimit')
const { errorHandler } = require('./middlewares/errorHandler')
const { initTerminalWs } = require('./ws/terminal')

const authRoutes = require('./routes/auth')
const publicRoutes = require('./routes/public')
const profileRoutes = require('./routes/profiles')
const adminRoutes = require('./routes/admin')

const app = express()
app.disable('x-powered-by')

// 请求日志(简要)
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    if (req.path === '/api/health') return
    logger.info(
      { method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - start },
      'http'
    )
  })
  next()
})

app.use('/api', apiLimiter)
app.use(express.json({ limit: '2mb' }))

// 路由
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'WebSSH Platform' }))
app.use('/api/public', publicRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/profiles', profileRoutes)
app.use('/api/admin', adminRoutes)

// API 404
app.use('/api', (req, res) => res.status(404).json({ message: '接口不存在' }))

// 静态托管 + SPA fallback(/api、/ws 除外)
if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir, { maxAge: '1h', index: 'index.html' }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next()
    res.sendFile(path.join(config.distDir, 'index.html'))
  })
} else if (config.isProd) {
  logger.warn('未找到 dist/,请先执行前端构建:npm run build')
}
app.get('*', (req, res) => {
  if (req.path.startsWith('/ws')) {
    return res.status(404).json({ message: 'Not Found' })
  }
  res
    .status(503)
    .send('前端尚未构建:请执行 npm install && npm run build,或直接使用 node server.js(会自动构建)')
})

app.use(errorHandler)

const server = http.createServer(app)
const { shutdownNotify } = initTerminalWs(server)

server.listen(config.port, async () => {
  logger.info(`WebSSH 服务已启动: http://localhost:${config.port}`)
  logger.info(`静态资源目录: ${config.distDir} (${fs.existsSync(config.distDir) ? '已挂载' : '不存在'})`)
})

// 优雅退出
async function shutdown(signal) {
  logger.info({ signal }, '收到退出信号,正在优雅关闭…')
  shutdownNotify()
  server.close(() => logger.info('HTTP 服务已关闭'))
  try {
    await prisma.$disconnect()
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(0), 1500).unref()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
