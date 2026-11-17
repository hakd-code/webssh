// 限速中间件:全局限速 + 认证限速 + 登录失败锁定(IP+账号,内存实现)
const rateLimit = require('express-rate-limit')

/** 全局 API 限速 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: '请求过于频繁,请稍后再试' },
})

/** 认证接口限速 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: '认证请求过于频繁,请稍后再试' },
})

// ---------------- 登录失败锁定(内存 Map) ----------------
// 15 分钟内同一 IP+账号 5 次失败 -> 锁定 15 分钟;成功登录清零
const LOCK_WINDOW_MS = 15 * 60 * 1000
const LOCK_MAX_FAILS = 5
const attempts = new Map() // key -> { fails: number[], lockedUntil: number }

function loginKey(ip, account) {
  return `${ip}::${String(account || '').toLowerCase()}`
}

function cleanupStale(entry, now) {
  if (!entry) return entry
  entry.fails = (entry.fails || []).filter((t) => now - t < LOCK_WINDOW_MS)
  if (entry.lockedUntil && now > entry.lockedUntil) {
    entry.lockedUntil = 0
    entry.fails = []
  }
  return entry
}

/** 检查是否允许登录;返回 { allowed, retryAfterSec } */
function checkLoginAllowed(ip, account) {
  const now = Date.now()
  const entry = cleanupStale(attempts.get(loginKey(ip, account)), now)
  if (entry && entry.lockedUntil && now < entry.lockedUntil) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    }
  }
  return { allowed: true, retryAfterSec: 0 }
}

/** 记录一次登录失败 */
function recordLoginFailure(ip, account) {
  const now = Date.now()
  const key = loginKey(ip, account)
  const entry = cleanupStale(attempts.get(key), now) || { fails: [], lockedUntil: 0 }
  entry.fails.push(now)
  if (entry.fails.length >= LOCK_MAX_FAILS) {
    entry.lockedUntil = now + LOCK_WINDOW_MS
    entry.fails = []
  }
  attempts.set(key, entry)
}

/** 登录成功后清零 */
function clearLoginFailures(ip, account) {
  attempts.delete(loginKey(ip, account))
}

/** 剩余可尝试次数(锁定时为 0) */
function remainingLoginAttempts(ip, account) {
  const now = Date.now()
  const entry = cleanupStale(attempts.get(loginKey(ip, account)), now)
  if (!entry) return LOCK_MAX_FAILS
  if (entry.lockedUntil && now < entry.lockedUntil) return 0
  return Math.max(0, LOCK_MAX_FAILS - (entry.fails || []).length)
}

// ---------------- 临时 SSH 限速(每 IP 每 10 分钟 5 次) ----------------
const TEMP_WINDOW_MS = 10 * 60 * 1000
const TEMP_MAX = 5
const tempAttempts = new Map() // ip -> number[]

function checkTempSshAllowed(ip) {
  const now = Date.now()
  const list = (tempAttempts.get(ip) || []).filter((t) => now - t < TEMP_WINDOW_MS)
  if (list.length >= TEMP_MAX) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((TEMP_WINDOW_MS - (now - list[0])) / 1000)),
    }
  }
  list.push(now)
  tempAttempts.set(ip, list)
  return { allowed: true, retryAfterSec: 0 }
}

module.exports = {
  apiLimiter,
  authLimiter,
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  remainingLoginAttempts,
  checkTempSshAllowed,
}
