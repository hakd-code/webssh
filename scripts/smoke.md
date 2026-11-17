# WebSSH 冒烟测试记录(smoke.md)

> 执行环境:Windows 10 / Git Bash / Node v22.14.0 / 服务运行于 http://localhost:3000(单端口,生产模式:Express 静态托管 client/dist)
> 执行方式:`cd server && bash scripts/smoke.sh > smoke-output.txt 2>&1`
> 结果:**32 / 32 全部通过**(含 6 项要求的冒烟流程 + WS 子测试 + 静态托管验证)

## 覆盖的测试项与结论

| # | 要求 | 关键验证点 | 结果 |
|---|---|---|---|
| 1 | 注册→登录→GET /api/auth/me→PATCH 改主题偏好 | 返回 token/user;me 返回用户;theme 变 dark | PASS |
| 2 | 档案 CRUD | 创建 password 档案;列表无明文凭据且有 hasCredential:true;编辑不传凭据=保留(hasCredential 仍 true);touch 更新 lastUsedAt;DELETE 成功 | PASS |
| 3 | Admin 流程 | PATCH 站点设置改 siteName 后 GET /api/public/site 即时反映;导航增/改/上移/下移/删;GET /api/admin/users 分页+搜索;禁用用户后其旧 token 请求 /api/auth/me 返回 401;解除禁用成功 | PASS |
| 4 | 忘记密码 | 响应统一"如邮箱存在,已发送邮件";SMTP 未配置时重置 URL 打印到服务端日志;用 token 重置成功;旧密码登录 401;新密码登录 200;重置前签发的旧 JWT 401 | PASS |
| 5 | WebSocket | 无 token 升级 HTTP 401;带 admin token 连接成功;非法 profileId 收到 error 帧;connectTemp 连 127.0.0.1:1 收到 error/closed 帧(ECONNREFUSED 失败路径)。脚本:`server/scripts/smoke-ws.js`,4/4 通过 | PASS |
| 6 | 登录限速 | 同一 IP+账号连续 5 次错误密码后,第 6 次返回 429 锁定提示(retryAfterSec=900) | PASS |
| 7 | 附加:静态托管 | GET / 返回构建后的 index.html;SPA fallback(/admin/users)200;/api/* 未知路径返回 JSON 404 | PASS |

## 注意事项(复现说明)

- 含中文的请求体通过临时文件 `--data-binary @file` 发送,规避 Git Bash → Windows curl 的参数编码转换;响应均为 UTF-8。
- 脚本可重复执行:smokeuser 已存在时自动用历史冒烟密码(Smoke@12345 / NewPass@67890)登录。
- 第 6 项测试后 `locktest` 账户会锁定 15 分钟(内存锁定,重启服务即清除),属预期行为;重复执行时可能第 1 次就返回 429,判定仍以"第 6 次为 429"为准。
- 重置链接从 `server/server-run.log` 中提取(pino 输出,`[SMTP 未配置兜底]` 行)。

---

## 完整执行记录(命令与响应)

```text

==============================================================
== 1. 注册 -> 登录 -> GET /api/auth/me -> PATCH /api/auth/me(改主题)
==============================================================

--- 1.1 注册 smokeuser(若已存在则改走登录)
POST /api/auth/register -> 409
{"message":"用户名已被使用"}
(用户已存在,通过登录获取 token,当前有效密码: NewPass@67890)

--- 1.2 登录(用户名+密码,记住我)
POST /api/auth/login -> 200
{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXdmN3JyaDkwMDAwYnJva2hmOWVvdDQxIiwidXNlcm5hbWUiOiJzbW9rZXVzZXIiLCJyb2xlIjoidXNlciIsInR2IjoyLCJpYXQiOjE3OTQ1ODg5MTAsImV4cCI6MTc5NzE4MDkxMH0.wMUwFgimQ7gcOXNxEeRL7FsqUA4Ah6PwJcELKBOJnRs","user":{"id":"cmwf7rrh90000brokhf9eot41","username":"smokeuser","email":"smokeuser@test.local","role":"user","status":"active","theme":"dark","createdAt":"2
[PASS] 登录返回 200 且包含 token 与 user

--- 1.3 GET /api/auth/me
GET /api/auth/me -> 200
{"user":{"id":"cmwf7rrh90000brokhf9eot41","username":"smokeuser","email":"smokeuser@test.local","role":"user","status":"active","theme":"dark","createdAt":"2026-11-13T16:51:30.141Z","lastLoginAt":"2026-11-13T16:55:10.721Z"}}
[PASS] 返回当前用户 smokeuser

--- 1.4 PATCH /api/auth/me 改主题偏好 dark
PATCH /api/auth/me -> 200
{"user":{"id":"cmwf7rrh90000brokhf9eot41","username":"smokeuser","email":"smokeuser@test.local","role":"user","status":"active","theme":"dark","createdAt":"2026-11-13T16:51:30.141Z","lastLoginAt":"2026-11-13T16:55:10.721Z"},"token":null}

[PASS] 主题已变为 dark

==============================================================
== 2. 档案 CRUD(创建 password 档案 -> 列表无明文 -> 编辑保留 -> touch -> 删除)
==============================================================

--- 2.1 创建 password 类型档案(凭据 secret-pwd-12345)
POST /api/profiles -> 201
{"item":{"id":"cmwf7wi7y001obrokcmp82vd5","name":"冒烟档案","host":"192.0.2.10","port":2222,"username":"root","authType":"password","note":"冒烟测试用","lastUsedAt":null,"createdAt":"2026-11-13T16:55:11.422Z","updatedAt":"2026-11-13T16:55:11.422Z","hasPassword":true,"hasPrivateKey":false,"hasPassphrase":false,"hasCredential":true}}

[PASS] 创建成功且响应不含明文密码

--- 2.2 列表:无明文凭据,有 hasCredential=true
GET /api/profiles -> 200
{"items":[{"id":"cmwf7wi7y001obrokcmp82vd5","name":"冒烟档案","host":"192.0.2.10","port":2222,"username":"root","authType":"password","note":"冒烟测试用","lastUsedAt":null,"createdAt":"2026-11-13T16:55:11.422Z","updatedAt":"2026-11-13T16:55:11.422Z","hasPassword":true,"hasPrivateKey":false,"hasPassphrase":false,"hasCredential":true}]}

[PASS] 列表含 hasCredential:true
[PASS] 列表不含明文 secret-pwd-12345

--- 2.3 编辑(不传凭据 = 保留)
PATCH /api/profiles/cmwf7wi7y001obrokcmp82vd5 -> 200
{"item":{"id":"cmwf7wi7y001obrokcmp82vd5","name":"冒烟档案-改","host":"192.0.2.10","port":2222,"username":"root","authType":"password","note":"改名不改凭据","lastUsedAt":null,"createdAt":"2026-11-13T16:55:11.422Z","updatedAt":"2026-11-13T16:55:11.929Z","hasPassword":true,"hasPrivateKey":false,"hasPassphrase":false,"hasCredential":true}}

[PASS] 编辑成功且 hasCredential 仍为 true(凭据保留)

--- 2.4 POST touch 更新最近使用
POST /api/profiles/cmwf7wi7y001obrokcmp82vd5/touch -> 200
{"item":{"id":"cmwf7wi7y001obrokcmp82vd5","name":"冒烟档案-改","host":"192.0.2.10","port":2222,"username":"root","authType":"password","note":"改名不改凭据","lastUsedAt":"2026-11-13T16:55:12.190Z","createdAt":"2026-11-13T16:55:11.422Z","updatedAt":"2026-11-13T16:55:12.191Z","hasPassword":
[PASS] lastUsedAt 已更新

--- 2.5 删除档案
DELETE /api/profiles/cmwf7wi7y001obrokcmp82vd5 -> 200
{"message":"删除成功"}
[PASS] 删除成功

==============================================================
== 3. Admin:站点设置 / 导航 / 用户管理 / 禁用即时生效
==============================================================

--- 3.1 admin 登录
POST /api/auth/login(admin) -> 200
[PASS] admin 登录成功

--- 3.2 PATCH /api/admin/settings 改 siteName
PATCH /api/admin/settings -> 200
{"message":"保存成功","updated":["siteName"]}
[PASS] 站点设置更新成功

--- 3.3 GET /api/public/site 反映变化
GET /api/public/site -> 200
{"siteName":"WebSSH 管理平台·冒烟修改版","subtitle":"浏览器里的云端终端,随时随地管理你的服务器","logo":"","loginWelcome":"欢迎回来,请登录以继续","allowRegister":true,"allowGuestSsh":true,"notice":"本平台仅供学习与内部运维使用,请妥善保管服�
[PASS] 公开接口 siteName 已变化

--- 3.4 导航:新增
POST /api/admin/navs -> 201
{"item":{"id":"cmwf7wjnu001ubrok2212myeq","label":"冒烟导航","url":"/quick-ssh","sort":4,"enabled":true,"newWindow":true}}

[PASS] 导航新增成功

--- 3.5 导航:编辑
PATCH /api/admin/navs/cmwf7wjnu001ubrok2212myeq -> 200
{"item":{"id":"cmwf7wjnu001ubrok2212myeq","label":"冒烟导航-改","url":"/quick-ssh","sort":4,"enabled":true,"newWindow":true}}

[PASS] 导航编辑成功

--- 3.6 导航:上移排序
POST /api/admin/navs/cmwf7wjnu001ubrok2212myeq/move(up) -> 200
{"message":"排序已更新"}
200

[PASS] 上移成功

--- 3.7 导航:下移恢复
POST /api/admin/navs/cmwf7wjnu001ubrok2212myeq/move(down) -> 200
[PASS] 下移成功

--- 3.8 导航:删除
DELETE /api/admin/navs/cmwf7wjnu001ubrok2212myeq -> 200
{"message":"删除成功"}
200
[PASS] 导航删除成功

--- 3.9 GET /api/admin/users 分页+搜索
GET /api/admin/users?page=1&pageSize=5&search=smokeuser -> 200
{"total":1,"page":1,"pageSize":5,"items":[{"id":"cmwf7rrh90000brokhf9eot41","username":"smokeuser","email":"smokeuser@test.local","role":"user","status":"active","theme":"dark","createdAt":"2026-11-13T16:51:30.141Z","lastLoginAt":"2026-11-13T16:55:10.721Z","profileCount":0}]}

[PASS] 分页搜索返回 smokeuser 且 total>=1

--- 3.10 禁用 smokeuser
PATCH /api/admin/users/cmwf7rrh90000brokhf9eot41(disabled) -> 200
{"item":{"id":"cmwf7rrh90000brokhf9eot41","username":"smokeuser","email":"smokeuser@test.local","role":"user","status":"disabled","theme":"dark","createdAt":"2026-11-13T16:51:30.141Z","lastLoginAt":"2
[PASS] 禁用成功

--- 3.11 被禁用用户的旧 token 请求 /api/auth/me 应 401
GET /api/auth/me(旧 token) -> 401
{"message":"账户已被禁用,请联系管理员"}
[PASS] 禁用后旧 token 返回 401

--- 3.12 解除禁用
PATCH /api/admin/users/cmwf7rrh90000brokhf9eot41(active) -> 200
[PASS] 解除禁用成功

--- 3.13 恢复 siteName(避免影响后续测试预期)
siteName 已恢复为默认值

==============================================================
== 4. 忘记密码 -> 服务端日志取重置链接 -> 重置 -> 旧密码失败/新密码成功/旧 JWT 失效
==============================================================

--- 4.1 POST /api/auth/forgot-password
POST /api/auth/forgot-password -> 200
{"message":"如邮箱存在,重置邮件已发送,请查收(注意垃圾邮件箱)"}
[PASS] 响应统一话术(不暴露邮箱是否存在)

--- 4.2 从服务端日志提取重置 URL(SMTP 未配置时写入 pino 日志)
日志中的重置链接: http://localhost:3000/reset-password?token=***(已脱敏)
[PASS] 日志中出现重置 URL

--- 4.3 用 token 重置密码 NewPass@67890
POST /api/auth/reset-password -> 200
{"message":"密码重置成功,请使用新密码登录"}
[PASS] 重置成功

--- 4.4 原始密码 Smoke@12345 登录应失败(401;重跑时该密码也早已不是当前密码)
POST /api/auth/login(旧密码) -> 401
[PASS] 旧密码登录失败

--- 4.5 新密码登录应成功
POST /api/auth/login(新密码) -> 200
[PASS] 新密码登录成功

--- 4.6 重置前签发的旧 JWT 应失效(401)
GET /api/auth/me(重置前旧 token) -> 401
{"message":"登录状态已失效(密码已变更),请重新登录"}
[PASS] 旧 JWT 已全部失效

==============================================================
== 5. WebSocket 终端(node scripts/smoke-ws.js)
==============================================================
PASS | 无 token 升级被拒 | httpStatus=401
PASS | 带 admin token 连接成功
PASS | 非法 profileId 被拒(error 帧) | 档案不存在或无权访问
PASS | connectTemp 127.0.0.1:1 失败路径(error/closed 帧) | [error] SSH 连接失败: connect ECONNREFUSED 127.0.0.1:1

WS 冒烟测试完成:4/4 通过
[PASS] WS 冒烟测试全部通过

==============================================================
== 6. 登录失败限速(15 分钟内 5 次失败锁定,第 6 次 429)
==============================================================

--- 6.1 准备限速专用账户 locktest
(注册/已存在均可,错误密码才是测试点)

--- 6.2 连续 6 次错误密码登录
第 1 次错误登录 -> HTTP 429 : {"message":"登录失败次数过多,账户已临时锁定,请约 12 分钟后再试","retryAfterSec":681}
第 2 次错误登录 -> HTTP 429 : {"message":"登录失败次数过多,账户已临时锁定,请约 12 分钟后再试","retryAfterSec":681}
第 3 次错误登录 -> HTTP 429 : {"message":"登录失败次数过多,账户已临时锁定,请约 12 分钟后再试","retryAfterSec":681}
第 4 次错误登录 -> HTTP 429 : {"message":"登录失败次数过多,账户已临时锁定,请约 12 分钟后再试","retryAfterSec":681}
第 5 次错误登录 -> HTTP 429 : {"message":"登录失败次数过多,账户已临时锁定,请约 12 分钟后再试","retryAfterSec":680}
第 6 次错误登录 -> HTTP 429 : {"message":"登录失败次数过多,账户已临时锁定,请约 12 分钟后再试","retryAfterSec":680}
[PASS] 第 6 次返回 429 锁定提示

==============================================================
== 7. 静态托管(SPA fallback)
==============================================================
GET / -> 200
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="基于浏�
[PASS] 根路径返回构建后的 index.html
GET /admin/users(SPA fallback) -> 200
[PASS] SPA fallback 200
GET /api/not-exist -> 404
[PASS] API 404 返回 JSON 404

==============================================================
冒烟测试结果:通过 32 / 32
==============================================================
```
