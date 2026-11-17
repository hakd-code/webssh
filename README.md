# WebSSH 在线服务器管理平台

基于浏览器的 WebSSH 终端与服务器管理平台:注册登录后保存 VPS 连接档案,一键进入交互式终端;管理员可管理站点设置、导航、页脚与用户。前端 Vue 3 + Element Plus + xterm.js,后端 Express + Prisma(SQLite)+ ssh2,单端口部署。

## 功能清单

### 认证
- 注册 / 登录(用户名或邮箱 + 密码,支持"记住我"延长 token 至 30 天)
- JWT 认证(REST `Authorization: Bearer`;WebSocket `?token=`)
- **tokenVersion 机制**:修改密码 / 管理员重置密码 / 邮箱重置密码成功后版本号 +1,该用户所有旧 JWT(REST 与 WS)立即失效
- 登录失败限速:按 **IP+账号** 维度,15 分钟内 5 次失败锁定 15 分钟(内存实现,成功登录清零)
- 忘记密码 / 邮箱重置:32 字节随机 token、SHA-256 哈希入库、15 分钟有效、单次使用;响应统一"如邮箱存在,已发送邮件"防枚举
- 个人设置:改邮箱、改密码、主题偏好(同步到 `User.theme`)

### VPS 档案(用户私有,严格隔离)
- 新增 / 编辑 / 删除(二次确认)/ 复制(密文直接复制)
- 凭据 AES-256-GCM 加密落库;API 永不回传明文,仅返回 `hasCredential` / `hasPassword` 等布尔;编辑表单"留空表示保留不修改"
- 搜索(名称/主机/备注/用户名)、排序(最近使用/按名称/最新创建)、连接后自动更新 `lastUsedAt`

### Web 终端(核心)
- xterm.js + ssh2,WebSocket 双向转发,`data` 帧使用 base64(UTF-8 无乱码)
- 两种连接入口:
  1. **档案连接**(登录用户,校验档案归属权,凭据后端解密,前端不接触明文)
  2. **临时连接**(游客可用的"快速 SSH"):凭据仅存于该次连接内存,连接结束即丢弃;受 `allowGuestSsh` 开关 + 每 IP 每 10 分钟 5 次限速;审计仅记录来源 IP,不记录目标主机与凭据;游客通过 `POST /api/public/guest-token` 获取 30 分钟短时效游客 JWT(仅允许 connectTemp)
- resize 自适应(ResizeObserver → `resize` 帧 → PTY `setWindow`)、SSH keepalive(30s)、WS 心跳(30s,心跳时重查用户 status,被禁用立即断开)
- 搜索 addon、链接可点击、字体大小调节、断线提示 + 手动重连、终端标题 OSC 同步(多标签标题)
- 多标签工作台(`/terminal`)+ 单连接页(`/terminal/:profileId`)
- 移动虚拟辅助键:Tab / Esc / Ctrl(粘滞)/ 方向键 / ^C ^D ^\ ^U ^L
- 终端配色随全局明暗主题切换(两套 palette)

### Admin 后台(四模块)
- **站点设置**:网站名 / 副标题 / 登录欢迎语 / 公告 / 注册开关 / 游客 SSH 开关;SMTP 配置(授权码不回传,留空保留)+ 发送测试邮件
- **导航管理**:增删改、上移下移排序、启用停用、新窗口打开;前端顶栏动态读取
- **页脚管理**:HTML 白名单(sanitize-html,允许 a/p/br/span/b/i/strong/em/ul/ol/li,剔除 script 与事件属性)、版权、备案号
- **用户管理**:搜索 / 分页 / 编辑 / 重置密码(该用户全部旧 JWT 失效)/ 启用禁用 / 角色变更 / 删除(二次确认并提示级联删除 N 个档案);不可对自己降权 / 禁用 / 删除;保护最后一个管理员
- 后台概览:用户数 / 档案数 / 今日登录 / 导航数 + 最近审计日志

### UI
- 明暗主题三态(亮 / 暗 / 跟随系统),localStorage 持久化 + 登录后同步到用户记录
- 统一顶栏(Logo + 动态导航 + 主题切换 + 用户菜单)、统一页脚(动态内容)
- 加载骨架屏、空状态、ElMessage 统一提示、路由过渡动画;全站中文文案
- 响应式:桌面 / 平板 / 手机;移动端抽屉菜单 + 终端虚拟辅助键

## 快速开始

要求:Node.js ≥ 20(推荐 22)。单包单命令:前后端依赖统一安装,一条命令启动完整站点。

```bash
# 1. 安装依赖(单一份依赖树,postinstall 自动执行 prisma generate)
npm install

# 2. 初始化数据库(建表 + 种子数据)
npx prisma db push
npx prisma db seed

# 3. 启动(node server.js 或 npm start;若 dist/ 不存在会自动执行 vite build)
npm start
```

浏览器打开 **http://localhost:3112** 即为完整站点(单端口托管 API + WebSocket + 前端页面)。

### 开发模式

```bash
npm run dev:server   # 后端:node --watch server.js(3112 端口,纯 API + WS)
npm run dev:vite     # 前端:Vite 5173 端口热更,/api 与 /ws 自动代理到 3112
```

单独构建前端:`npm run build`(产物输出到根目录 `dist/`)。

环境变量:项目根提供 `.env.example`(含 `JWT_SECRET`、`ENCRYPTION_KEY`、`PORT`(默认 3112)、`APP_URL`)。
**首次启动若根目录 `.env` 不存在,会自动从 `.env.example` 复制一份**,开发可直接跑;生产请自行生成新密钥:

## 默认账号

| 账号 | 密码 | 角色 |
|---|---|---|
| `admin` | `Admin@123456` | 管理员 |
| (注册自建) | — | 普通用户 |

## 测试要点

1. **注册 → 登录 → /api/auth/me → 改主题偏好**:登录后主题偏好写入用户记录,换浏览器登录仍生效。
2. **档案 CRUD**:创建档案 → 列表接口无明文凭据(`hasCredential: true`)→ 编辑不传凭据 = 保留 → touch 更新最近使用 → 删除需确认。
3. **Admin**:改网站名后游客首页/顶栏即时生效;导航增删改排序即时生效;禁用用户后其旧 token 请求 `/api/auth/me` 返回 401(WS 心跳同样会被断开)。
4. **忘记密码**:未配置 SMTP 时,重置 URL 会通过 pino 打印到服务端日志(形如 `[SMTP 未配置兜底] 密码重置链接:https://.../reset-password?token=...`),可从日志取出完成重置;重置后旧密码失效、旧 JWT 全部失效(401)。
5. **WS 终端**:`node scripts/smoke-ws.js`(需服务已启动)验证升级鉴权 / 非法档案 / 失败路径;真实连接可使用 `/quick-ssh` 手输本机可达的 SSH 服务器信息验证 vim / htop / 中文 / resize。
6. **限速**:连续 6 次错误密码登录,第 6 次返回 429 锁定提示(15 分钟)。
7. 冒烟测试命令与结果留档:`scripts/smoke.md`。

## 目录结构

```
webssh/
├─ package.json        # 唯一 package.json:前后端依赖合并;scripts 含 start/build/dev:server/dev:vite
├─ server.js           # 根入口:node server.js 一条命令启动(dist 缺失时自动 vite build)
├─ vite.config.ts      # root:'web',构建输出到根目录 dist/;开发代理 /api 与 /ws → 3112
├─ src/                # 后端(Express + ws + Prisma)
│  ├─ index.js         #   Express + ws + 静态托管 + SPA fallback
│  ├─ config.js        #   环境变量与密钥(读取根目录 .env,端口默认 3112)
│  ├─ db.js / logger.js / utils.js
│  ├─ middlewares/     #   auth(JWT+tokenVersion)/ rateLimit / errorHandler
│  ├─ routes/          #   auth / profiles / public / admin(settings|navs|footer|users)
│  ├─ services/        #   crypto(AES-256-GCM)/ mailer / settings / audit
│  └─ ws/terminal.js   #   WS 升级鉴权、消息协议、ssh2 会话管理、心跳
├─ prisma/             # schema.prisma + seed.js + dev.db(SQLite 数据)
├─ web/                # 前端源码(Vue3 + Vite5 + TS + Pinia + Element Plus + xterm)
│  ├─ index.html
│  ├─ tsconfig.json
│  └─ src/{views,components,stores,api,router,styles}
├─ scripts/            # smoke-ws.js + smoke.sh(+ smoke.md 历史留档)
├─ dist/               # 前端构建产物(gitignore)
├─ .env / .env.example
└─ README.md
```

## 部署说明(生产)

- 进程管理:PM2 或 systemd 托管 `node server.js`(或 `npm start`);单端口 3112。
- HTTPS:建议 Nginx 反向代理并透传 `Upgrade` 头以支持 WebSocket。
- 备份:定期备份 `prisma/dev.db` 与 `ENCRYPTION_KEY`。

## 实现偏差说明(与需求文档 v1.0)

1. **游客临时 SSH 的 WS 鉴权**:文档 §4.6 称 connectTemp "无需 JWT"。实现上 WS 升级仍要求携带 token(满足"无 token 升级 401"的安全要求),游客通过 `POST /api/public/guest-token` 获取 30 分钟短时效、仅允许 connectTemp 的游客 JWT;已登录用户直接用登录 token。开关与限速行为与文档一致。
2. **拖拽排序**:导航排序采用上移/下移按钮(文档允许"拖拽或上下移按钮"二选一)。
3. **Logo 上传**:站点设置中 Logo 为文字/图片 URL 字段,未实现文件上传(文档标注"可选")。
4. **分组 groupId**:档案分组为文档 v1.1 规划,未实现。
5. **SMTP 测试邮件报错**:未配置或发送失败时返回友好中文错误提示;SMTP 未配置时的重置链接会写入服务端 pino 日志(见上"测试要点 4")。
6. **数据库**:按约定使用 SQLite(`prisma/dev.db`);如需 MySQL/PostgreSQL 仅需改 `schema.prisma` 的 provider。
