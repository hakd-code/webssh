// /ws/terminal WebSocket 终端:升级鉴权 + ssh2 会话管理
const { WebSocketServer } = require('ws')
const { Client } = require('ssh2')
const jwt = require('jsonwebtoken')
const { config } = require('../config')
const prisma = require('../db')
const logger = require('../logger')
const { extractToken } = require('../middlewares/auth')
const { checkTempSshAllowed } = require('../middlewares/rateLimit')
const { tryDecrypt } = require('../services/crypto')
const { getAllSettings } = require('../services/settings')
const { audit } = require('../services/audit')
const { getIp } = require('../utils')

const HEARTBEAT_INTERVAL = 30 * 1000

/** 每个 ws 连接的状态 */
// ws._state = { user, ssh: Client|null, stream: null, alive: bool, tempIp: string|null }

function send(ws, obj) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj))
    } catch {
      /* ignore */
    }
  }
}

function cleanupSsh(ws, reason) {
  const state = ws._state
  if (!state) return
  if (state.stream) {
    try {
      state.stream.end()
    } catch {
      /* ignore */
    }
    state.stream = null
  }
  if (state.ssh) {
    try {
      state.ssh.end()
    } catch {
      /* ignore */
    }
    state.ssh = null
  }
  if (reason) logger.debug({ reason }, 'SSH 会话已清理')
}

/** 发起 SSH 连接(档案或临时) */
function startSsh(ws, sshConfig, meta) {
  const state = ws._state
  if (state.ssh) {
    send(ws, { type: 'error', message: '当前连接已有 SSH 会话,请先断开后再连接' })
    return
  }
  const conn = new Client()
  state.ssh = conn
  send(ws, { type: 'status', stage: 'connecting' })

  conn.on('ready', () => {
    if (ws.readyState !== 1 || state.ssh !== conn) {
      conn.end()
      return
    }
    conn.shell(
      {
        term: 'xterm-256color',
        cols: state.cols || 80,
        rows: state.rows || 24,
      },
      (err, stream) => {
        if (err) {
          send(ws, { type: 'error', message: `创建 Shell 失败: ${err.message}` })
          cleanupSsh(ws)
          return
        }
        state.stream = stream
        send(ws, { type: 'connected', host: meta.host, username: meta.username })
        stream.on('data', (chunk) => {
          send(ws, { type: 'data', data: chunk.toString('base64') })
        })
        stream.stderr.on('data', (chunk) => {
          send(ws, { type: 'data', data: chunk.toString('base64') })
        })
        stream.on('close', () => {
          send(ws, { type: 'closed', reason: '远程会话已结束' })
          cleanupSsh(ws)
        })
      }
    )
  })

  conn.on('error', (err) => {
    const level = err.level || 'socket'
    const msg =
      level === 'authentication'
        ? 'SSH 认证失败:用户名或密码/密钥不正确'
        : `SSH 连接失败: ${err.message}`
    send(ws, { type: 'error', message: msg })
    send(ws, { type: 'closed', reason: msg })
    cleanupSsh(ws)
  })

  conn.on('close', () => {
    if (state.ssh === conn) {
      state.ssh = null
      state.stream = null
    }
  })

  conn.connect({
    host: sshConfig.host,
    port: sshConfig.port,
    username: sshConfig.username,
    ...(sshConfig.authType === 'privateKey'
      ? { privateKey: sshConfig.privateKey, passphrase: sshConfig.passphrase || undefined }
      : { password: sshConfig.password }),
    readyTimeout: 20000,
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
    tryKeyboard: false,
  })
}

function handleMessage(ws, raw) {
  let msg
  try {
    msg = JSON.parse(raw.toString())
  } catch {
    send(ws, { type: 'error', message: '消息格式错误(需要 JSON)' })
    return
  }
  if (!msg || typeof msg.type !== 'string') {
    send(ws, { type: 'error', message: '消息缺少 type 字段' })
    return
  }
  const state = ws._state
  switch (msg.type) {
    case 'connect': {
      // 档案连接:必须登录且校验归属(游客令牌不可用)
      if (state.user.isGuest) {
        send(ws, { type: 'error', message: '游客仅可使用临时 SSH,登录后才能连接档案' })
        return
      }
      const profileId = String(msg.profileId || '')
      if (!profileId) {
        send(ws, { type: 'error', message: '缺少 profileId' })
        return
      }
      prisma.profile
        .findUnique({ where: { id: profileId } })
        .then((profile) => {
          if (!profile || profile.userId !== state.user.id) {
            send(ws, { type: 'error', message: '档案不存在或无权访问' })
            return
          }
          const password = tryDecrypt(profile.password)
          const privateKey = tryDecrypt(profile.privateKey)
          const passphrase = tryDecrypt(profile.passphrase)
          if (profile.authType === 'privateKey' && !privateKey) {
            send(ws, { type: 'error', message: '私钥解密失败(加密密钥可能已更换)' })
            return
          }
          if (profile.authType === 'password' && password === null) {
            send(ws, { type: 'error', message: '密码解密失败(加密密钥可能已更换)' })
            return
          }
          startSsh(
            ws,
            {
              host: profile.host,
              port: profile.port,
              username: profile.username,
              authType: profile.authType,
              password,
              privateKey,
              passphrase,
            },
            { host: profile.host, username: profile.username }
          )
        })
        .catch((err) => {
          logger.error({ err: err.message }, '查询档案失败')
          send(ws, { type: 'error', message: '服务器内部错误' })
        })
      break
    }
    case 'connectTemp': {
      // 临时连接:受 allowGuestSsh 开关与每 IP 限速约束;凭据仅存内存,连接结束即丢弃
      handleTempConnect(ws, msg)
      break
    }
    case 'data': {
      if (!state.stream) {
        send(ws, { type: 'error', message: '尚未建立 SSH 会话' })
        return
      }
      const buf = Buffer.from(String(msg.data || ''), 'base64')
      if (buf.length > 0 && buf.length <= 1024 * 512) {
        state.stream.write(buf)
      }
      break
    }
    case 'resize': {
      const cols = Math.max(2, Math.min(500, Number(msg.cols) || 80))
      const rows = Math.max(2, Math.min(300, Number(msg.rows) || 24))
      state.cols = cols
      state.rows = rows
      if (state.stream) {
        try {
          state.stream.setWindow(rows, cols, rows * 16, cols * 8)
        } catch {
          /* ignore */
        }
      }
      break
    }
    case 'ping': {
      send(ws, { type: 'pong', time: Date.now() })
      break
    }
    case 'disconnect': {
      cleanupSsh(ws)
      send(ws, { type: 'closed', reason: '已主动断开' })
      break
    }
    default:
      send(ws, { type: 'error', message: `未知消息类型: ${msg.type}` })
  }
}

/** 临时 SSH:校验开关 + 限速 + 参数,审计只记录来源 IP */
async function handleTempConnect(ws, msg) {
  const state = ws._state
  try {
    const settings = await getAllSettings()
    if (settings.allowGuestSsh === 'false') {
      send(ws, { type: 'error', message: '管理员已关闭临时 SSH 功能' })
      return
    }
    const ip = state.ip
    const limit = checkTempSshAllowed(ip)
    if (!limit.allowed) {
      send(ws, {
        type: 'error',
        message: `临时连接过于频繁(每 IP 每 10 分钟最多 5 次),请约 ${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`,
      })
      return
    }
    const host = String(msg.host || '').trim()
    const port = Number(msg.port) || 22
    const username = String(msg.username || '').trim()
    const authType = msg.authType === 'privateKey' ? 'privateKey' : 'password'
    if (!host || host.length > 255 || !username || username.length > 64) {
      send(ws, { type: 'error', message: '主机与用户名不能为空' })
      return
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      send(ws, { type: 'error', message: '端口不合法' })
      return
    }
    const password = authType === 'password' ? String(msg.password || '') : null
    const privateKey = authType === 'privateKey' ? String(msg.privateKey || '') : null
    const passphrase = msg.passphrase ? String(msg.passphrase) : null
    if (authType === 'password' && !password) {
      send(ws, { type: 'error', message: '请输入密码' })
      return
    }
    if (authType === 'privateKey' && !privateKey) {
      send(ws, { type: 'error', message: '请输入私钥' })
      return
    }
    // 审计仅记录来源 IP,不记录目标主机与凭据
    await audit({
      userId: state.user.id || null,
      username: state.user.isGuest ? null : state.user.username || null,
      action: 'TEMP_SSH_ATTEMPT',
      detail: '发起临时 SSH 连接(目标与凭据不予记录)',
      ip,
    })
    startSsh(
      ws,
      { host, port, username, authType, password, privateKey, passphrase },
      { host, username }
    )
  } catch (err) {
    logger.error({ err: err.message }, '临时连接处理失败')
    send(ws, { type: 'error', message: '服务器内部错误' })
  }
}

/** 初始化 WS 终端服务 */
function initTerminalWs(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

  server.on('upgrade', async (req, socket, head) => {
    let pathname = '/'
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      socket.destroy()
      return
    }
    if (pathname !== '/ws/terminal') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    // 升级阶段校验 JWT
    const fakeReq = { headers: req.headers, query: {} }
    // token 放在查询串里
    try {
      const urlObj = new URL(req.url, 'http://localhost')
      fakeReq.query = Object.fromEntries(urlObj.searchParams)
    } catch {
      /* ignore */
    }
    const token = extractToken(fakeReq)
    let payload = null
    try {
      payload = jwt.verify(token, config.jwtSecret)
    } catch {
      payload = null
    }
    // 游客令牌(仅允许临时 SSH)
    if (payload && payload.role === 'guest' && String(payload.sub || '').startsWith('guest:')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws._state = {
          user: { id: null, username: 'guest', isGuest: true },
          ip: getIp({ headers: req.headers, socket }),
          ssh: null,
          stream: null,
          cols: 80,
          rows: 24,
          alive: true,
        }
        wss.emit('connection', ws, req)
      })
      return
    }
    let user = null
    if (payload && payload.sub) {
      user = await prisma.user
        .findUnique({ where: { id: payload.sub } })
        .catch(() => null)
      if (user && user.status !== 'active') user = null
      if (user && payload.tv !== user.tokenVersion) user = null
    }
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n{"message":"未登录或登录已失效"}')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._state = {
        user: { id: user.id, username: user.username, isGuest: false },
        ip: getIp({ headers: req.headers, socket }),
        ssh: null,
        stream: null,
        cols: 80,
        rows: 24,
        alive: true,
      }
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    const state = ws._state
    logger.debug({ userId: state.user.id }, 'WS 终端连接建立')
    send(ws, { type: 'open', username: state.user.username })

    ws.on('message', (raw) => {
      if (state.alive !== false) handleMessage(ws, raw)
    })

    ws.on('pong', () => {
      state.alive = true
    })

    ws.on('close', () => {
      cleanupSsh(ws)
      logger.debug({ userId: state.user.id }, 'WS 终端连接关闭')
    })

    ws.on('error', () => {
      cleanupSsh(ws)
      try {
        ws.terminate()
      } catch {
        /* ignore */
      }
    })
  })

  // 心跳:30s 一轮;存活检查 + 重查用户 status,disabled 则断开并销毁 SSH
  const heartbeat = setInterval(async () => {
    const clients = [...wss.clients]
    // 收集本轮需要复查的用户
    const userIds = new Set()
    for (const ws of clients) {
      if (!ws._state) continue
      if (!ws._state.alive) {
        try {
          ws.terminate()
        } catch {
          /* ignore */
        }
        continue
      }
      ws._state.alive = false
      try {
        ws.ping()
      } catch {
        /* ignore */
      }
      if (ws._state.user.id) userIds.add(ws._state.user.id)
    }
    if (userIds.size === 0) return
    try {
      const disabled = await prisma.user.findMany({
        where: { id: { in: [...userIds] }, status: { not: 'active' } },
        select: { id: true },
      })
      if (disabled.length === 0) return
      const disabledIds = new Set(disabled.map((u) => u.id))
      for (const ws of clients) {
        if (ws._state && disabledIds.has(ws._state.user.id)) {
          send(ws, { type: 'closed', reason: '账户已被禁用,连接已断开' })
          cleanupSsh(ws)
          try {
            ws.terminate()
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, HEARTBEAT_INTERVAL)

  heartbeat.unref()

  /** 优雅退出:通知在线客户端 */
  function shutdownNotify() {
    clearInterval(heartbeat)
    for (const ws of wss.clients) {
      send(ws, { type: 'closed', reason: '服务器正在维护重启,请稍后重连' })
      cleanupSsh(ws)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    try {
      wss.close()
    } catch {
      /* ignore */
    }
  }

  return { wss, shutdownNotify }
}

module.exports = { initTerminalWs }
