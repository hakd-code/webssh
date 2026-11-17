<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { getToken } from '@/api/http'
import type { TempSshParams, TermStatus } from '@/api/types'

const props = defineProps<{
  profileId?: string
  tempParams?: TempSshParams
  title?: string
  showVirtualKeys?: boolean
  /** 游客模式:由外部传入的短时效 WS 令牌 */
  guestToken?: string
}>()

const emit = defineEmits<{
  (e: 'status', status: TermStatus, detail?: string): void
  (e: 'title', title: string): void
  (e: 'close'): void
}>()

const themeStore = useThemeStore()
const auth = useAuthStore()

const containerRef = ref<HTMLDivElement | null>(null)
const status = ref<TermStatus>('connecting')
const statusDetail = ref('')
const fontSize = ref(14)
const showSearch = ref(false)
const searchKeyword = ref('')
const stickyCtrl = ref(false)
const showVk = ref(props.showVirtualKeys ?? window.innerWidth < 992)

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null
let pingTimer: number | null = null
let disposed = false

// ---- 终端配色(明/暗两套) ----
const DARK_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
}

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#24292f',
  cursor: '#0969da',
  cursorAccent: '#ffffff',
  selectionBackground: '#b6d7ff',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#9a6700',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#f6f8fa',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#bf8700',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#ffffff',
}

function currentTheme() {
  return themeStore.isDark ? DARK_THEME : LIGHT_THEME
}

// ---- base64 工具(UTF-8 安全) ----
function toB64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function writeB64(b64: string) {
  if (!term) return
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  term.write(bytes)
}

function sendJson(obj: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

function setStatus(s: TermStatus, detail?: string) {
  status.value = s
  if (detail !== undefined) statusDetail.value = detail
  emit('status', s, detail)
}

// ---- WS 生命周期 ----
function resolveToken(): string {
  // 游客令牌优先(QuickSsh 未登录场景),其次登录 token
  return props.guestToken || getToken() || auth.token || ''
}

function connect() {
  if (disposed) return
  cleanupSocket()
  setStatus('connecting')
  term?.writeln('\x1b[90m-- 正在建立连接… --\x1b[0m')

  const token = resolveToken()
  if (!token) {
    setStatus('error', '缺少访问令牌,请先登录')
    term?.writeln('\x1b[31m错误: 缺少访问令牌,请先登录后再试。\x1b[0m')
    return
  }

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`)

  ws.onopen = () => {
    if (props.profileId) {
      sendJson({ type: 'connect', profileId: props.profileId })
    } else if (props.tempParams) {
      const p = props.tempParams
      sendJson({
        type: 'connectTemp',
        host: p.host,
        port: p.port,
        username: p.username,
        authType: p.authType,
        password: p.password,
        privateKey: p.privateKey,
        passphrase: p.passphrase,
      })
    }
    // 建立后立刻同步终端尺寸
    setTimeout(() => sendResize(), 100)
    // 应用层心跳
    pingTimer = window.setInterval(() => sendJson({ type: 'ping' }), 25000)
  }

  ws.onmessage = (ev) => {
    let msg: any
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    switch (msg.type) {
      case 'connected':
        setStatus('connected')
        break
      case 'data':
        writeB64(msg.data)
        break
      case 'error':
        term?.writeln(`\r\n\x1b[31m[错误] ${msg.message || '未知错误'}\x1b[0m`)
        setStatus('error', msg.message)
        break
      case 'closed':
        term?.writeln(`\r\n\x1b[33m[连接已断开] ${msg.reason || ''}\x1b[0m`)
        setStatus('closed', msg.reason)
        cleanupSocket()
        break
      case 'pong':
        break
      default:
        break
    }
  }

  ws.onerror = () => {
    // onclose 通常随后触发,这里不重复提示
  }

  ws.onclose = (ev) => {
    if (status.value !== 'closed') {
      term?.writeln(
        `\r\n\x1b[33m[连接已关闭] code=${ev.code}${ev.reason ? ' ' + ev.reason : ''}\x1b[0m`
      )
      setStatus('closed', `连接关闭(code=${ev.code})`)
    }
    cleanupSocket()
  }
}

function cleanupSocket() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function disconnect() {
  sendJson({ type: 'disconnect' })
  cleanupSocket()
  ws?.close()
  setStatus('closed', '已主动断开')
}

// ---- xterm 初始化 ----
function initTerm() {
  if (!containerRef.value) return
  term = new Terminal({
    fontFamily: '"Cascadia Mono", Menlo, Monaco, "Courier New", "Microsoft YaHei Mono", monospace',
    fontSize: fontSize.value,
    cursorBlink: true,
    scrollback: 5000,
    theme: currentTheme(),
    allowProposedApi: true,
  })
  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.loadAddon(new WebLinksAddon())
  term.open(containerRef.value)
  term.attachCustomKeyEventHandler(customKeyHandler)
  term.onData((d) => sendJson({ type: 'data', data: toB64(d) }))
  term.onResize(() => sendResize())
  term.onTitleChange((t) => {
    if (t) emit('title', t)
  })
  term.focus()

  fitAddon.fit()
  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit()
    } catch {
      /* ignore */
    }
  })
  resizeObserver.observe(containerRef.value)
}

function customKeyHandler(ev: KeyboardEvent): boolean {
  // 粘滞 Ctrl(移动端虚拟键):下一个单字符按键转换为 Ctrl 组合
  if (stickyCtrl.value && ev.type === 'keydown' && ev.key && ev.key.length === 1 && !ev.ctrlKey) {
    const code = ev.key.toUpperCase().charCodeAt(0)
    if (code >= 64 && code <= 95) {
      sendJson({ type: 'data', data: toB64(String.fromCharCode(code - 64)) })
      stickyCtrl.value = false
      return false
    }
  }
  return true
}

function sendResize() {
  if (term) {
    sendJson({ type: 'resize', cols: term.cols, rows: term.rows })
  }
}

// ---- 工具条动作 ----
function changeFont(delta: number) {
  fontSize.value = Math.max(10, Math.min(24, fontSize.value + delta))
  if (term) {
    term.options.fontSize = fontSize.value
    nextTick(() => fitAddon?.fit())
  }
}

function doSearch(direction: 'next' | 'prev') {
  if (!searchKeyword.value) return
  if (direction === 'next') searchAddon?.findNext()
  else searchAddon?.findPrevious()
}

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (!showSearch.value) {
    searchAddon?.clearDecorations()
  }
}

function sendSeq(seq: string) {
  sendJson({ type: 'data', data: toB64(seq) })
  term?.focus()
}

function toggleStickyCtrl() {
  stickyCtrl.value = !stickyCtrl.value
}

function toggleVk() {
  showVk.value = !showVk.value
  nextTick(() => fitAddon?.fit())
}

// ---- 主题跟随 ----
watch(
  () => themeStore.isDark,
  () => {
    if (term) term.options.theme = currentTheme()
  }
)

onMounted(() => {
  initTerm()
  connect()
})

onBeforeUnmount(() => {
  disposed = true
  cleanupSocket()
  if (ws) {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }
  resizeObserver?.disconnect()
  term?.dispose()
  term = null
})

defineExpose({
  focus: () => term?.focus(),
  sendSeq,
  toggleStickyCtrl,
  clear: () => {
    term?.clear()
    term?.focus()
  },
})
</script>

<template>
  <div class="terminal-pane" :class="{ 'vk-sticky-on': stickyCtrl }">
    <!-- 工具条 -->
    <div class="pane-toolbar">
      <span class="status-dot" :class="`status-dot--${status}`"></span>
      <el-tag :type="status === 'connected' ? 'success' : status === 'error' ? 'danger' : status === 'connecting' ? 'warning' : 'info'" size="small" effect="plain">
        {{ status === 'connecting' ? '连接中' : status === 'connected' ? '已连接' : status === 'closed' ? '已断开' : '出错' }}
      </el-tag>
      <el-tooltip v-if="statusDetail" :content="statusDetail" placement="bottom">
        <span class="status-reason">{{ statusDetail }}</span>
      </el-tooltip>

      <div class="toolbar-right">
        <el-button-group>
          <el-button size="small" @click="changeFont(-1)" title="减小字体">
            <el-icon><ZoomOut /></el-icon>
          </el-button>
          <el-button size="small" style="pointer-events: none; font-size: 12px">{{ fontSize }}px</el-button>
          <el-button size="small" @click="changeFont(1)" title="增大字体">
            <el-icon><ZoomIn /></el-icon>
          </el-button>
        </el-button-group>
        <el-button size="small" :type="showSearch ? 'primary' : ''" @click="toggleSearch" title="搜索">
          <el-icon><Search /></el-icon>
        </el-button>
        <el-button size="small" :type="showVk ? 'primary' : ''" @click="toggleVk" title="辅助键盘">
          <el-icon><Cellphone /></el-icon>
        </el-button>
        <el-button size="small" @click="connect" title="重新连接" :disabled="status === 'connected' || status === 'connecting'">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
        <el-button size="small" type="danger" plain @click="disconnect" :disabled="status !== 'connected' && status !== 'connecting'">
          断开
        </el-button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div v-if="showSearch" class="pane-search">
      <el-input
        v-model="searchKeyword"
        size="small"
        placeholder="搜索终端内容…"
        clearable
        @keyup.enter="doSearch('next')"
        style="width: 220px"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button size="small" @click="doSearch('prev')">上一个</el-button>
      <el-button size="small" @click="doSearch('next')">下一个</el-button>
    </div>

    <!-- 终端主体 -->
    <div ref="containerRef" class="term-container"></div>

    <!-- 移动虚拟辅助键 -->
    <div v-if="showVk" class="vk-bar" :class="{ 'vk-bar--sticky-on': stickyCtrl }">
      <el-button size="small" class="vk-ctrl" :type="stickyCtrl ? 'primary' : ''" @click="toggleStickyCtrl">
        Ctrl{{ stickyCtrl ? '•' : '' }}
      </el-button>
      <el-button size="small" @click="sendSeq('\t')">Tab</el-button>
      <el-button size="small" @click="sendSeq('\x1b')">Esc</el-button>
      <el-button size="small" @click="sendSeq('\x03')">^C</el-button>
      <el-button size="small" @click="sendSeq('\x04')">^D</el-button>
      <el-button size="small" @click="sendSeq('\x1c')">^\</el-button>
      <el-button size="small" @click="sendSeq('\x15')">^U</el-button>
      <el-button size="small" @click="sendSeq('\x0c')">^L</el-button>
      <span class="vk-sep"></span>
      <el-button size="small" @click="sendSeq('\x1b[A')">↑</el-button>
      <el-button size="small" @click="sendSeq('\x1b[B')">↓</el-button>
      <el-button size="small" @click="sendSeq('\x1b[D')">←</el-button>
      <el-button size="small" @click="sendSeq('\x1b[C')">→</el-button>
    </div>
  </div>
</template>

<style scoped>
.terminal-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--el-bg-color);
}

.pane-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.status-reason {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.term-container {
  flex: 1;
  min-height: 0;
  padding: 4px 6px;
}

.vk-sep {
  width: 8px;
}
</style>
