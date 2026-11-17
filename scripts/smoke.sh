#!/usr/bin/env bash
# WebSSH 冒烟测试(需服务已运行在 http://localhost:3112)
# 用法:在项目根目录执行 bash scripts/smoke.sh
# 说明:含中文的请求体写入临时文件后用 curl -d @file 发送,
#       避免 Git Bash 向 Windows 原生 curl 传参时的编码转换问题。
set -u
BASE="${SMOKE_BASE:-http://localhost:3112}"
BODYF="$(mktemp)"

PASS=0
FAIL=0

# 从 JSON 中取字段(支持 a.b.c 路径)
jget() {
  node -e "
    try {
      const o = JSON.parse(process.argv[1]);
      let v = o;
      for (const p of (process.argv[2]||'').split('.').filter(Boolean)) v = v == null ? undefined : v[p];
      console.log(v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
    } catch (e) { console.log(''); }
  " "$1" "$2"
}

section() { echo ""; echo "=============================================================="; echo "== $1"; echo "=============================================================="; }
step()    { echo ""; echo "--- $1"; }
check()   { if [ "$2" = "1" ]; then echo "[PASS] $1"; PASS=$((PASS+1)); else echo "[FAIL] $1"; FAIL=$((FAIL+1)); fi }

CURL="curl -s"

# =========================== 1. 认证流程 ===========================
section "1. 注册 -> 登录 -> GET /api/auth/me -> PATCH /api/auth/me(改主题)"

step "1.1 注册 smokeuser(若已存在则改走登录)"
SMOKE_PWD='Smoke@12345'
cat > "$BODYF" <<'EOF'
{"username":"smokeuser","email":"smokeuser@test.local","password":"Smoke@12345"}
EOF
REG_RESP=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' --data-binary @"$BODYF")
REG_CODE=$(echo "$REG_RESP" | tail -1); REG_BODY=$(echo "$REG_RESP" | head -1)
echo "POST /api/auth/register -> $REG_CODE"
echo "$REG_BODY"
SUID=$(jget "$REG_BODY" user.id)
UTOKEN=$(jget "$REG_BODY" token)
if [ -z "$UTOKEN" ]; then
  # 用户已存在:依次尝试历史冒烟密码(脚本可重复执行)
  for PWD in 'Smoke@12345' 'NewPass@67890'; do
    cat > "$BODYF" <<EOF
{"account":"smokeuser","password":"$PWD"}
EOF
    LOGIN_RESP=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data-binary @"$BODYF")
    LOGIN_BODY=$(echo "$LOGIN_RESP" | head -1)
    T=$(jget "$LOGIN_BODY" token)
    if [ -n "$T" ]; then UTOKEN="$T"; SUID=$(jget "$LOGIN_BODY" user.id); SMOKE_PWD="$PWD"; break; fi
  done
  echo "(用户已存在,通过登录获取 token,当前有效密码: $SMOKE_PWD)"
fi

step "1.2 登录(用户名+密码,记住我)"
cat > "$BODYF" <<EOF
{"account":"smokeuser","password":"$SMOKE_PWD","rememberMe":true}
EOF
LOGIN_RESP=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data-binary @"$BODYF")
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1); LOGIN_BODY=$(echo "$LOGIN_RESP" | head -1)
echo "POST /api/auth/login -> $LOGIN_CODE"
echo "$LOGIN_BODY" | head -c 400; echo ""
T=$(jget "$LOGIN_BODY" token)
[ -n "$T" ] && UTOKEN="$T"
check "登录返回 200 且包含 token 与 user" "$([ "$LOGIN_CODE" = "200" ] && [ -n "$UTOKEN" ] && echo 1 || echo 0)"

step "1.3 GET /api/auth/me"
ME_RESP=$($CURL -w '\n%{http_code}' "$BASE/api/auth/me" -H "Authorization: Bearer $UTOKEN")
ME_CODE=$(echo "$ME_RESP" | tail -1); ME_BODY=$(echo "$ME_RESP" | head -1)
echo "GET /api/auth/me -> $ME_CODE"
echo "$ME_BODY"
check "返回当前用户 smokeuser" "$([ "$ME_CODE" = "200" ] && [ "$(jget "$ME_BODY" user.username)" = "smokeuser" ] && echo 1 || echo 0)"

step "1.4 PATCH /api/auth/me 改主题偏好 dark"
cat > "$BODYF" <<'EOF'
{"theme":"dark"}
EOF
PATCH_RESP=$($CURL -w '\n%{http_code}' -X PATCH "$BASE/api/auth/me" -H "Authorization: Bearer $UTOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
PATCH_CODE=$(echo "$PATCH_RESP" | tail -1); PATCH_BODY=$(echo "$PATCH_RESP" | head -1)
echo "PATCH /api/auth/me -> $PATCH_CODE"
echo "$PATCH_BODY" | head -c 300; echo ""
check "主题已变为 dark" "$([ "$(jget "$PATCH_BODY" user.theme)" = "dark" ] && echo 1 || echo 0)"

# =========================== 2. 档案 CRUD ===========================
section "2. 档案 CRUD(创建 password 档案 -> 列表无明文 -> 编辑保留 -> touch -> 删除)"

step "2.1 创建 password 类型档案(凭据 secret-pwd-12345)"
cat > "$BODYF" <<'EOF'
{"name":"冒烟档案","host":"192.0.2.10","port":2222,"username":"root","authType":"password","password":"secret-pwd-12345","note":"冒烟测试用"}
EOF
P_CREATE=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/profiles" -H "Authorization: Bearer $UTOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
P_CODE=$(echo "$P_CREATE" | tail -1); P_BODY=$(echo "$P_CREATE" | head -1)
echo "POST /api/profiles -> $P_CODE"
echo "$P_BODY" | head -c 400; echo ""
PID=$(jget "$P_BODY" item.id)
check "创建成功且响应不含明文密码" "$([ "$P_CODE" = "201" ] && [ -n "$PID" ] && ! echo "$P_BODY" | grep -q "secret-pwd-12345" && echo 1 || echo 0)"

step "2.2 列表:无明文凭据,有 hasCredential=true"
P_LIST=$($CURL -w '\n%{http_code}' "$BASE/api/profiles" -H "Authorization: Bearer $UTOKEN")
L_CODE=$(echo "$P_LIST" | tail -1); L_BODY=$(echo "$P_LIST" | head -1)
echo "GET /api/profiles -> $L_CODE"
echo "$L_BODY" | head -c 500; echo ""
check "列表含 hasCredential:true" "$(echo "$L_BODY" | grep -q '"hasCredential":true' && echo 1 || echo 0)"
check "列表不含明文 secret-pwd-12345" "$(echo "$L_BODY" | grep -q 'secret-pwd-12345' && echo 0 || echo 1)"

step "2.3 编辑(不传凭据 = 保留)"
cat > "$BODYF" <<'EOF'
{"name":"冒烟档案-改","note":"改名不改凭据"}
EOF
P_PATCH=$($CURL -w '\n%{http_code}' -X PATCH "$BASE/api/profiles/$PID" -H "Authorization: Bearer $UTOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
PP_CODE=$(echo "$P_PATCH" | tail -1); PP_BODY=$(echo "$P_PATCH" | head -1)
echo "PATCH /api/profiles/$PID -> $PP_CODE"
echo "$PP_BODY" | head -c 400; echo ""
check "编辑成功且 hasCredential 仍为 true(凭据保留)" "$([ "$PP_CODE" = "200" ] && [ "$(jget "$PP_BODY" item.hasCredential)" = "true" ] && echo 1 || echo 0)"

step "2.4 POST touch 更新最近使用"
P_TOUCH=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/profiles/$PID/touch" -H "Authorization: Bearer $UTOKEN")
T_CODE=$(echo "$P_TOUCH" | tail -1); T_BODY=$(echo "$P_TOUCH" | head -1)
echo "POST /api/profiles/$PID/touch -> $T_CODE"
echo "$T_BODY" | head -c 300; echo ""
check "lastUsedAt 已更新" "$([ -n "$(jget "$T_BODY" item.lastUsedAt)" ] && echo 1 || echo 0)"

step "2.5 删除档案"
P_DEL=$($CURL -w '\n%{http_code}' -X DELETE "$BASE/api/profiles/$PID" -H "Authorization: Bearer $UTOKEN")
D_CODE=$(echo "$P_DEL" | tail -1); D_BODY=$(echo "$P_DEL" | head -1)
echo "DELETE /api/profiles/$PID -> $D_CODE"
echo "$D_BODY"
check "删除成功" "$([ "$D_CODE" = "200" ] && echo 1 || echo 0)"

# =========================== 3. Admin 后台 ===========================
section "3. Admin:站点设置 / 导航 / 用户管理 / 禁用即时生效"

step "3.1 admin 登录"
cat > "$BODYF" <<'EOF'
{"account":"admin","password":"Admin@123456"}
EOF
A_RESP=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data-binary @"$BODYF")
A_CODE=$(echo "$A_RESP" | tail -1); A_BODY=$(echo "$A_RESP" | head -1)
ATOKEN=$(jget "$A_BODY" token)
echo "POST /api/auth/login(admin) -> $A_CODE"
check "admin 登录成功" "$([ "$A_CODE" = "200" ] && [ "$(jget "$A_BODY" user.role)" = "admin" ] && echo 1 || echo 0)"

step "3.2 PATCH /api/admin/settings 改 siteName"
cat > "$BODYF" <<'EOF'
{"siteName":"WebSSH 管理平台·冒烟修改版"}
EOF
S_PATCH=$($CURL -w '\n%{http_code}' -X PATCH "$BASE/api/admin/settings" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
SP_CODE=$(echo "$S_PATCH" | tail -1); SP_BODY=$(echo "$S_PATCH" | head -1)
echo "PATCH /api/admin/settings -> $SP_CODE"
echo "$SP_BODY"
check "站点设置更新成功" "$([ "$SP_CODE" = "200" ] && echo 1 || echo 0)"

step "3.3 GET /api/public/site 反映变化"
SITE=$($CURL -w '\n%{http_code}' "$BASE/api/public/site")
SITE_CODE=$(echo "$SITE" | tail -1); SITE_BODY=$(echo "$SITE" | head -1)
echo "GET /api/public/site -> $SITE_CODE"
echo "$SITE_BODY" | head -c 300; echo ""
check "公开接口 siteName 已变化" "$([ "$(jget "$SITE_BODY" siteName)" = "WebSSH 管理平台·冒烟修改版" ] && echo 1 || echo 0)"

step "3.4 导航:新增"
cat > "$BODYF" <<'EOF'
{"label":"冒烟导航","url":"/quick-ssh","enabled":true,"newWindow":true}
EOF
N_CREATE=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/admin/navs" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
NC_CODE=$(echo "$N_CREATE" | tail -1); NC_BODY=$(echo "$N_CREATE" | head -1)
NID=$(jget "$NC_BODY" item.id)
echo "POST /api/admin/navs -> $NC_CODE"
echo "$NC_BODY" | head -c 300; echo ""
check "导航新增成功" "$([ "$NC_CODE" = "201" ] && [ -n "$NID" ] && echo 1 || echo 0)"

step "3.5 导航:编辑"
cat > "$BODYF" <<'EOF'
{"label":"冒烟导航-改"}
EOF
N_PATCH=$($CURL -w '\n%{http_code}' -X PATCH "$BASE/api/admin/navs/$NID" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
NP_CODE=$(echo "$N_PATCH" | tail -1); NP_BODY=$(echo "$N_PATCH" | head -1)
echo "PATCH /api/admin/navs/$NID -> $NP_CODE"
echo "$NP_BODY" | head -c 300; echo ""
check "导航编辑成功" "$([ "$(jget "$NP_BODY" item.label)" = "冒烟导航-改" ] && echo 1 || echo 0)"

step "3.6 导航:上移排序"
cat > "$BODYF" <<'EOF'
{"direction":"up"}
EOF
N_MOVE=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/admin/navs/$NID/move" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
echo "POST /api/admin/navs/$NID/move(up) -> $(echo "$N_MOVE" | tail -1)"
echo "$N_MOVE" | head -c 200; echo ""
check "上移成功" "$([ "$(echo "$N_MOVE" | tail -1)" = "200" ] && echo 1 || echo 0)"

step "3.7 导航:下移恢复"
cat > "$BODYF" <<'EOF'
{"direction":"down"}
EOF
N_MOVE2=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/admin/navs/$NID/move" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
echo "POST /api/admin/navs/$NID/move(down) -> $(echo "$N_MOVE2" | tail -1)"
check "下移成功" "$([ "$(echo "$N_MOVE2" | tail -1)" = "200" ] && echo 1 || echo 0)"

step "3.8 导航:删除"
N_DEL=$($CURL -w '\n%{http_code}' -X DELETE "$BASE/api/admin/navs/$NID" -H "Authorization: Bearer $ATOKEN")
echo "DELETE /api/admin/navs/$NID -> $(echo "$N_DEL" | tail -1)"
echo "$N_DEL"
check "导航删除成功" "$([ "$(echo "$N_DEL" | tail -1)" = "200" ] && echo 1 || echo 0)"

step "3.9 GET /api/admin/users 分页+搜索"
U_LIST=$($CURL -w '\n%{http_code}' "$BASE/api/admin/users?page=1&pageSize=5&search=smokeuser" -H "Authorization: Bearer $ATOKEN")
UL_CODE=$(echo "$U_LIST" | tail -1); UL_BODY=$(echo "$U_LIST" | head -1)
echo "GET /api/admin/users?page=1&pageSize=5&search=smokeuser -> $UL_CODE"
echo "$UL_BODY" | head -c 500; echo ""
check "分页搜索返回 smokeuser 且 total>=1" "$([ "$UL_CODE" = "200" ] && [ "$(jget "$UL_BODY" total)" != "" ] && [ "$(jget "$UL_BODY" items.0.username)" = "smokeuser" ] && echo 1 || echo 0)"

step "3.10 禁用 smokeuser"
cat > "$BODYF" <<'EOF'
{"status":"disabled"}
EOF
U_DIS=$($CURL -w '\n%{http_code}' -X PATCH "$BASE/api/admin/users/$SUID" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
echo "PATCH /api/admin/users/$SUID(disabled) -> $(echo "$U_DIS" | tail -1)"
echo "$U_DIS" | head -c 200; echo ""
check "禁用成功" "$([ "$(echo "$U_DIS" | tail -1)" = "200" ] && echo 1 || echo 0)"

step "3.11 被禁用用户的旧 token 请求 /api/auth/me 应 401"
ME2=$($CURL -w '\n%{http_code}' "$BASE/api/auth/me" -H "Authorization: Bearer $UTOKEN")
ME2_CODE=$(echo "$ME2" | tail -1); ME2_BODY=$(echo "$ME2" | head -1)
echo "GET /api/auth/me(旧 token) -> $ME2_CODE"
echo "$ME2_BODY"
check "禁用后旧 token 返回 401" "$([ "$ME2_CODE" = "401" ] && echo 1 || echo 0)"

step "3.12 解除禁用"
cat > "$BODYF" <<'EOF'
{"status":"active"}
EOF
U_EN=$($CURL -w '\n%{http_code}' -X PATCH "$BASE/api/admin/users/$SUID" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF")
echo "PATCH /api/admin/users/$SUID(active) -> $(echo "$U_EN" | tail -1)"
check "解除禁用成功" "$([ "$(echo "$U_EN" | tail -1)" = "200" ] && echo 1 || echo 0)"

step "3.13 恢复 siteName(避免影响后续测试预期)"
cat > "$BODYF" <<'EOF'
{"siteName":"WebSSH 管理平台"}
EOF
$CURL -X PATCH "$BASE/api/admin/settings" -H "Authorization: Bearer $ATOKEN" \
  -H 'Content-Type: application/json' --data-binary @"$BODYF" > /dev/null
echo "siteName 已恢复为默认值"

# =========================== 4. 忘记密码 ===========================
section "4. 忘记密码 -> 服务端日志取重置链接 -> 重置 -> 旧密码失败/新密码成功/旧 JWT 失效"

step "4.1 POST /api/auth/forgot-password"
cat > "$BODYF" <<'EOF'
{"email":"smokeuser@test.local"}
EOF
FP=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/forgot-password" -H 'Content-Type: application/json' --data-binary @"$BODYF")
FP_CODE=$(echo "$FP" | tail -1); FP_BODY=$(echo "$FP" | head -1)
echo "POST /api/auth/forgot-password -> $FP_CODE"
echo "$FP_BODY"
check "响应统一话术(不暴露邮箱是否存在)" "$([ "$FP_CODE" = "200" ] && echo "$FP_BODY" | grep -q '如邮箱存在' && echo 1 || echo 0)"

step "4.2 从服务端日志提取重置 URL(SMTP 未配置时写入 pino 日志)"
sleep 1
RESET_URL=$(grep -ao 'http://[^"]*/reset-password?token=[0-9a-f]*' server-run.log 2>/dev/null | tail -1)
echo "日志中的重置链接: ${RESET_URL%%token=*}token=***(已脱敏)"
check "日志中出现重置 URL" "$([ -n "$RESET_URL" ] && echo 1 || echo 0)"

RESET_TOKEN="${RESET_URL##*token=}"
step "4.3 用 token 重置密码 NewPass@67890"
cat > "$BODYF" <<EOF
{"token":"$RESET_TOKEN","newPassword":"NewPass@67890"}
EOF
RP=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/reset-password" -H 'Content-Type: application/json' --data-binary @"$BODYF")
RP_CODE=$(echo "$RP" | tail -1); RP_BODY=$(echo "$RP" | head -1)
echo "POST /api/auth/reset-password -> $RP_CODE"
echo "$RP_BODY"
check "重置成功" "$([ "$RP_CODE" = "200" ] && echo "$RP_BODY" | grep -q '成功' && echo 1 || echo 0)"

step "4.4 原始密码 Smoke@12345 登录应失败(401;重跑时该密码也早已不是当前密码)"
cat > "$BODYF" <<'EOF'
{"account":"smokeuser","password":"Smoke@12345"}
EOF
OLD=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data-binary @"$BODYF")
echo "POST /api/auth/login(旧密码) -> $(echo "$OLD" | tail -1)"
check "旧密码登录失败" "$([ "$(echo "$OLD" | tail -1)" = "401" ] && echo 1 || echo 0)"

step "4.5 新密码登录应成功"
cat > "$BODYF" <<'EOF'
{"account":"smokeuser","password":"NewPass@67890"}
EOF
NEW=$($CURL -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data-binary @"$BODYF")
NEW_BODY=$(echo "$NEW" | head -1)
echo "POST /api/auth/login(新密码) -> $(echo "$NEW" | tail -1)"
check "新密码登录成功" "$([ "$(echo "$NEW" | tail -1)" = "200" ] && [ -n "$(jget "$NEW_BODY" token)" ] && echo 1 || echo 0)"

step "4.6 重置前签发的旧 JWT 应失效(401)"
ME3=$($CURL -w '\n%{http_code}' "$BASE/api/auth/me" -H "Authorization: Bearer $UTOKEN")
echo "GET /api/auth/me(重置前旧 token) -> $(echo "$ME3" | tail -1)"
echo "$ME3" | head -1
check "旧 JWT 已全部失效" "$([ "$(echo "$ME3" | tail -1)" = "401" ] && echo 1 || echo 0)"

# =========================== 5. WebSocket ===========================
section "5. WebSocket 终端(node scripts/smoke-ws.js)"
node scripts/smoke-ws.js
WS_RC=$?
check "WS 冒烟测试全部通过" "$([ "$WS_RC" = "0" ] && echo 1 || echo 0)"

# =========================== 6. 登录限速 ===========================
section "6. 登录失败限速(15 分钟内 5 次失败锁定,第 6 次 429)"

step "6.1 准备限速专用账户 locktest"
cat > "$BODYF" <<'EOF'
{"username":"locktest","email":"locktest@test.local","password":"Lock@12345"}
EOF
LT=$($CURL -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' --data-binary @"$BODYF")
echo "(注册/已存在均可,错误密码才是测试点)"

step "6.2 连续 6 次错误密码登录"
for i in 1 2 3 4 5 6; do
  cat > "$BODYF" <<'EOF'
{"account":"locktest","password":"WrongPass!"}
EOF
  R=$($CURL -w '|%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' --data-binary @"$BODYF")
  CODE="${R##*|}"; BODY="${R%|*}"
  echo "第 $i 次错误登录 -> HTTP $CODE : $(echo "$BODY" | head -c 120)"
done
check "第 6 次返回 429 锁定提示" "$([ "$CODE" = "429" ] && echo 1 || echo 0)"

# =========================== 7. 静态托管 ===========================
section "7. 静态托管(SPA fallback)"
INDEX=$($CURL -w '|%{http_code}' "$BASE/")
I_CODE="${INDEX##*|}"; I_BODY="${INDEX%|*}"
echo "GET / -> $I_CODE"
echo "$I_BODY" | head -c 200; echo ""
check "根路径返回构建后的 index.html" "$([ "$I_CODE" = "200" ] && echo "$I_BODY" | grep -q '<div id="app">' && echo 1 || echo 0)"

SPAF=$($CURL -w '|%{http_code}' "$BASE/admin/users")
echo "GET /admin/users(SPA fallback) -> ${SPAF##*|}"
check "SPA fallback 200" "$([ "${SPAF##*|}" = "200" ] && echo 1 || echo 0)"

API404=$($CURL -w '|%{http_code}' "$BASE/api/not-exist")
echo "GET /api/not-exist -> ${API404##*|}"
check "API 404 返回 JSON 404" "$([ "${API404##*|}" = "404" ] && echo 1 || echo 0)"

rm -f "$BODYF"
echo ""
echo "=============================================================="
echo "冒烟测试结果:通过 $PASS / $((PASS+FAIL))"
echo "=============================================================="
[ "$FAIL" = "0" ]
