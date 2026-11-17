/**
 * WS 终端冒烟测试(node scripts/smoke-ws.js)
 * 前置:服务器已运行在 ws://localhost:3112
 * 用例:
 *  1. 无 token 升级被拒(HTTP 401)
 *  2. 带 admin token 连接成功
 *  3. connectTemp 连 127.0.0.1:1(本机无 SSH)→ 收到 error/closed 帧
 *  4. connect 非法 profileId → 收到 error 帧
 */
process.env.NODE_ENV = process.env.NODE_ENV || ''
const WebSocket = require('ws')
const http = require('http')

const BASE = process.env.SMOKE_BASE || 'http://localhost:3112'

function apiPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {})
    const u = new URL(path, BASE)
    const req = http.request(
      u,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) })
          } catch {
            resolve({ status: res.statusCode, body: raw })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function wsConnect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    const result = { ws, httpStatus: null, open: false }
    ws.on('open', () => {
      result.open = true
      resolve(result)
    })
    ws.on('unexpected-response', (req, res) => {
      result.httpStatus = res.statusCode
      resolve(result)
    })
    ws.on('error', (err) => {
      // 升级失败时 ws 库会先触发 unexpected-response;其余错误记录
      if (!result.httpStatus) result.error = err.message
      resolve(result)
    })
    setTimeout(() => resolve(result), 8000)
  })
}

function waitFrame(ws, predicate, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const onData = (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (predicate(msg)) {
        ws.off('message', onData)
        resolve(msg)
      }
    }
    ws.on('message', onData)
    setTimeout(() => resolve(null), timeoutMs)
  })
}

async function main() {
  const results = []
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`)
  }

  // 先登录拿 admin token
  const login = await apiPost('/api/auth/login', {
    account: 'admin',
    password: 'Admin@123456',
  })
  if (login.status !== 200 || !login.body.token) {
    console.error('admin 登录失败,无法继续 WS 测试:', login.body)
    process.exit(1)
  }
  const token = login.body.token

  // 1. 无 token → 401
  const r1 = await wsConnect(`${BASE.replace('http', 'ws')}/ws/terminal`)
  check('无 token 升级被拒', !r1.open && r1.httpStatus === 401, `httpStatus=${r1.httpStatus}`)
  try {
    r1.ws && r1.ws.terminate()
  } catch {}

  // 2. 带 admin token → open
  const r2 = await wsConnect(`${BASE.replace('http', 'ws')}/ws/terminal?token=${encodeURIComponent(token)}`)
  check('带 admin token 连接成功', r2.open, r2.open ? '' : `httpStatus=${r2.httpStatus}`)

  if (r2.open) {
    // 3. 非法 profileId → error
    const errFrame = waitFrame(r2.ws, (m) => m.type === 'error', 6000)
    r2.ws.send(JSON.stringify({ type: 'connect', profileId: 'not-exist-profile-id' }))
    const got3 = await errFrame
    check('非法 profileId 被拒(error 帧)', Boolean(got3), got3 ? got3.message : '未收到 error 帧')

    // 4. connectTemp → 127.0.0.1:1 → error/closed(本机无 SSH)
    const failFrame = waitFrame(
      r2.ws,
      (m) => m.type === 'error' || m.type === 'closed',
      25000
    )
    r2.ws.send(
      JSON.stringify({
        type: 'connectTemp',
        host: '127.0.0.1',
        port: 1,
        username: 'root',
        authType: 'password',
        password: 'wrong-password',
      })
    )
    const got4 = await failFrame
    check(
      'connectTemp 127.0.0.1:1 失败路径(error/closed 帧)',
      Boolean(got4 && (got4.type === 'error' || got4.type === 'closed')),
      got4 ? `[${got4.type}] ${got4.message || got4.reason}` : '超时未收到帧'
    )
    r2.ws.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nWS 冒烟测试完成:${results.length - failed.length}/${results.length} 通过`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
