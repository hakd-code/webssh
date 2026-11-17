// 单命令入口:node server.js
// 1. 若前端构建产物 dist/index.html 不存在,自动执行 vite build
// 2. 加载后端 src/index(Express API + WS 终端 + 静态托管 + SPA fallback)
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const rootDir = __dirname
const distIndex = path.join(rootDir, 'dist', 'index.html')

if (!fs.existsSync(distIndex)) {
  console.log('[server] 未检测到 dist/index.html,正在自动构建前端(vite build)…')
  try {
    execSync('npx vite build', { stdio: 'inherit', cwd: rootDir })
    console.log('[server] 前端构建完成。')
  } catch (err) {
    console.error('')
    console.error('[server] 前端自动构建失败!请先执行以下命令后重试:')
    console.error('          1) npm install')
    console.error('          2) npm run build')
    console.error('')
    process.exit(1)
  }
}

require('./src/index')
