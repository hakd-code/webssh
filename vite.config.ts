import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 前端源码位于 web/ 子目录(root: 'web'),构建产物输出到根目录 dist/
// 开发模式:/api 与 /ws 代理到 3112 端口的 Express 服务(node server.js 或 npm run dev:server)
export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3112',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3112',
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
    outDir: '../dist',
    emptyOutDir: true,
  },
})
