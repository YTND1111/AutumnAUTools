# 秋功用户后端（Cloudflare Workers + D1）

面向 AutumnAUTools（秋功）的用户账号与数据同步服务，**专为 Cloudflare 托管选型与适配**：

| 需求 | Cloudflare 方案 | 说明 |
| --- | --- | --- |
| 运行时 | **Workers**（模块语法 `fetch` 处理器） | 全球边缘执行，免费额度每天 10 万请求 |
| 数据库 | **D1**（Serverless SQLite） | 免费额度 5 GB 存储、每天 500 万行读 / 10 万行写 |
| 口令哈希 | **Web Crypto** `PBKDF2-SHA256` | 无第三方加密库；配合 `AUTH_PEPPER` 做 HMAC 预处理 |
| 会话 | D1 存 token 的 SHA-256 摘要 | 不透明随机 token，可随时吊销，不等于 JWT 无法撤销 |
| 定时清理 | **Cron Triggers** | 每天 04:00 UTC 清过期会话与陈旧限流计数 |
| 依赖 | **零运行时依赖**（仅 devDependency: wrangler / typescript） | 无需 `nodejs_compat`，冷启动最小、供应链风险最低 |

> 为什么零依赖：Workers 生态的 Hono/itty-router 都很好，但本项目端点数量少（15 个），
> 自带一个 ~90 行的 `src/router.ts` 就够；同时零依赖让 `node scripts/smoke-test.mjs`
> 能在**不装 wrangler、不联网**的情况下端到端跑通全部接口（见下文「自测」）。

---

## 1. 目录结构

```
backend/
├── wrangler.toml            # Worker 配置：D1 绑定、环境变量、Cron、dev 端口
├── package.json             # dev / deploy / test / 迁移脚本
├── tsconfig.json            # 仅类型校验（noEmit），零类型依赖
├── .dev.vars.example        # 本地环境变量模板（复制为 .dev.vars）
├── migrations/
│   └── 0001_init.sql        # users / sessions / user_settings / user_plans / auth_attempts
├── scripts/
│   ├── d1-shim.mjs          # node:sqlite 实现的 D1 桩（仅测试用）
│   └── smoke-test.mjs       # 端到端冒烟测试：72 项断言
└── src/
    ├── index.ts             # Worker 入口：CORS、路由分发、统一错误、scheduled 清理
    ├── config.ts            # Env → AppConfig（含各项上限与默认值）
    ├── types.ts             # 自声明的 D1 / Env 类型（零类型依赖）
    ├── http.ts              # JSON 信封、ApiError、CORS 头、请求体大小/类型校验
    ├── crypto.ts            # PBKDF2 口令哈希、HMAC 胡椒、SHA-256、随机 token
    ├── session.ts           # 会话签发/校验/滑动续期/Cookie 生成
    ├── ratelimit.ts         # 基于 D1 的登录/注册/敏感操作限流
    ├── validate.ts          # 用户名/密码/邮箱/数据对象校验
    ├── db.ts                # 全部 SQL（用户、会话、设置、方案）
    ├── guard.ts             # requireUser（401 统一出口）
    ├── router.ts            # 极简路由（静态段 + :param）
    └── routes/
        ├── meta.ts          # /api/health、/api/meta、/api（自描述索引）
        ├── auth.ts          # 注册 / 登录 / 注销 / 当前用户
        ├── data.ts          # /api/settings、/api/plans（同构 CRUD）
        └── account.ts       # 导出数据 / 改密 / 注销账号
```

---

## 2. 快速开始（首次部署）

```bash
cd backend
pnpm install                 # 或 npm install；仅装 wrangler 与 typescript

# ① 登录 Cloudflare（浏览器授权）
pnpm exec wrangler login

# ② 创建 D1 数据库，把输出的 database_id 填回 wrangler.toml
pnpm exec wrangler d1 create autumn-autools

# ③ 建表（本地 + 远程各执行一次）
pnpm exec wrangler d1 migrations apply autumn-autools --remote

# ④ 设置口令胡椒（强烈建议；值随机且务必留存）
pnpm exec wrangler secret put AUTH_PEPPER

# ⑤ 部署
pnpm run deploy
# → https://autumn-autools-api.<你的子域>.workers.dev
```

部署后自检：

```bash
curl https://autumn-autools-api.<子域>.workers.dev/api/health
# {"ok":true,"service":"autumn-autools-api","database":"ok", ...}
curl https://autumn-autools-api.<子域>.workers.dev/api        # 全部端点索引
```

### 绑定自定义域（推荐）

`*.workers.dev` 在国内网络环境下可能不稳定，且跨域会带来 Cookie/CORS 复杂度。
推荐把 Worker 挂到自有域名下（Cloudflare 控制台 → Workers → 你的 Worker → Settings → Domains & Routes
→ Add → Custom Domain，例如 `api.example.com`），前端再用 `VITE_BACKEND_BASE_URL` 指向它。

---

## 3. 本地开发

```bash
cd backend
cp .dev.vars.example .dev.vars          # 修改 AUTH_PEPPER / ALLOWED_ORIGINS
pnpm exec wrangler d1 migrations apply autumn-autools --local
pnpm run dev                            # → http://127.0.0.1:8787
```

前端开发服务器已配置代理（`app/vite.config.ts`）：

```
浏览器 http://localhost:3000  ──/api/*──▶  vite proxy  ──▶  http://127.0.0.1:8787
```

因此本地开发**不需要**配置 `VITE_BACKEND_BASE_URL`，浏览器看到的是同源 `/api`，无跨域问题。

手测示例：

```bash
curl -s http://127.0.0.1:8787/api/health
curl -s -X POST http://127.0.0.1:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo-password"}'
curl -s http://127.0.0.1:8787/api/settings -H "Authorization: Bearer <token>"
```

---

## 4. 自测（零依赖，可离线运行）

```bash
cd backend
node scripts/smoke-test.mjs     # 等价于 pnpm test
node ../app/node_modules/typescript/bin/tsc -p tsconfig.json   # 或 pnpm run typecheck
```

冒烟测试用 Node 24 内置的 `node:sqlite` 实现 D1 桩（`scripts/d1-shim.mjs`），
**直接 import 真实的 `src/index.ts`** 并调用 `worker.fetch` / `worker.scheduled`，
覆盖 72 项断言：

- 元信息 / 健康检查 / 404 / 405（含 `Allow` 头）
- CORS 预检：白名单来源回显 ACAO，未授权来源不回显
- 注册：口令策略、重名（含大小写）、重复邮箱、响应不泄露哈希
- 会话：Bearer 与 Cookie 双通道、伪造 token、过期处理
- 登录：错误口令、不存在的用户（响应时间等价 + 文案不泄露）、失败 10 次锁定 429（带 `Retry-After`）、按 IP+用户名 维度隔离
- 设置/方案：往返一致、revision 递增、`If-Match` 冲突 409（回带服务端当前数据）、`__proto__` 键拒绝、超限 413
- 多用户隔离：bob 读不到 alice 的设置与方案
- 账号：导出、改密（旧 token 全失效）、注销（级联删除）、密码二次确认
- `ALLOW_REGISTRATION=false` → 403
- `scheduled` 定时清理过期会话与陈旧限流行

> ⚠️ D1 桩仅用于逻辑自测；并发、一致性、真实迁移工具链请以 `wrangler dev` + 远程 D1 为准。

---

## 5. API 一览

统一响应信封：成功 `{ "ok": true, ... }`，失败 `{ "ok": false, "error": { "code", "message", "details?" } }`。
除 `/api/health`、`/api/meta`、`/api` 外，其余端点均需登录（`Authorization: Bearer <token>` 或同源 Cookie）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 + D1 连通性（异常时 503） |
| GET | `/api/meta` | 公开配置：是否开放注册、字段长度与体积上限 |
| GET | `/api` | 端点自描述索引 |
| POST | `/api/auth/register` | `{username, password, email?, displayName?}` → `{user, token, expiresAt}` |
| POST | `/api/auth/login` | `{username, password}` → `{user, token, expiresAt}` |
| POST | `/api/auth/logout` | 204，吊销当前会话并清 Cookie（幂等） |
| GET | `/api/auth/me` | `{user, session:{expiresAt}}` |
| GET | `/api/settings` | `{data, revision, updatedAt}`（无数据时 `data:null`） |
| PUT | `/api/settings` | `{data:{...}}`，支持 `If-Match: <revision>` → `{revision, updatedAt}` |
| DELETE | `/api/settings` | 204，清空该用户云端设置 |
| GET/PUT/DELETE | `/api/plans` | 同上，配课方案（体积上限更大） |
| GET | `/api/account/export` | 导出账号 + 设置 + 方案的完整 JSON |
| POST | `/api/account/password` | `{currentPassword, newPassword}`，其它设备全部下线并返回新 token |
| DELETE | `/api/account` | `{password}`，级联删除账号与全部数据 |

### 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `invalid_username` / `invalid_password` / `invalid_email` / `invalid_field` / `invalid_data` / `invalid_json` / `empty_body` / `invalid_if_match` | 参数不合法 |
| 401 | `unauthorized` | 未登录或会话过期 |
| 401 | `invalid_credentials` | 用户名或密码错误 |
| 403 | `registration_disabled` | 已关闭注册 |
| 404 | `not_found` | 路径不存在 |
| 405 | `method_not_allowed` | 方法不支持（带 `Allow` 头） |
| 409 | `username_taken` / `email_taken` | 用户名 / 邮箱被占用 |
| 409 | `revision_conflict` | 乐观锁冲突（`details` 含服务端当前数据） |
| 413 | `payload_too_large` | 请求体超限 |
| 415 | `unsupported_media_type` | 请求体不是 `application/json` |
| 429 | `rate_limited` | 触发限流/锁定（带 `Retry-After`） |
| 500 | `internal_error` | 服务端异常（详情只进日志） |

---

## 6. 配置项

`wrangler.toml [vars]`（非敏感）与 `wrangler secret`（敏感）：

| 名称 | 默认 | 说明 |
| --- | --- | --- |
| `DB` | — | D1 绑定（`[[d1_databases]]`，必须是 `DB`） |
| `ENVIRONMENT` | `development` | 设为 `production` 时下发 `Secure` Cookie |
| `APP_NAME` | `秋功 AutumnAUTools` | 展示用名称 |
| `ALLOWED_ORIGINS` | — | CORS 白名单，逗号分隔；`*` = 放行所有来源 |
| `ALLOW_REGISTRATION` | `true` | `false` 关闭注册（私有部署） |
| `SESSION_TTL_DAYS` | `30` | 会话有效期，1~365（滑动续期） |
| `PBKDF2_ITERATIONS` | `100000` | 10000~1000000，见下文「CPU 与免费额度」 |
| `MAX_PAYLOAD_KB` | `256` | 单请求体上限，1~4096（实际生效值还会与端点自身上限取小） |
| `AUTH_PEPPER` | 空 | **secret**，口令胡椒；设置后不可更改（改了所有密码失效） |

端点自身上限：设置 32 KB、方案 1 MB（与 `MAX_PAYLOAD_KB` 取较小者）。

---

## 7. 数据模型

```sql
users(id PK, username, username_lower UNIQUE, display_name, email, email_lower UNIQUE,
      password_hash, created_at, updated_at, last_login_at)
sessions(token_hash PK, user_id → users.id, created_at, expires_at, last_seen_at, user_agent, ip)
user_settings(user_id PK → users.id, data TEXT, revision, updated_at)
user_plans(user_id PK → users.id, data TEXT, revision, updated_at)
auth_attempts(key PK, count, window_start, locked_until)
```

- 时间戳统一为**毫秒级 Unix 时间**（与前端 `Date.now()` 对齐）；
- `username_lower` / `email_lower` 承载唯一约束，避免大小写重复账号；
- `data` 为前端 JSON 快照整块存储（当前设置仅一个字段、方案为配课状态），
  读写走 `revision` 乐观锁；日后若需要多方案/增量同步，可新增独立表而不影响现有契约；
- `sessions.token_hash` = `SHA-256(token)`，库泄露也无法直接冒用会话。

---

## 8. 安全设计

1. **口令哈希**：`PBKDF2-HMAC-SHA256`，16 字节随机盐，格式自描述
   `pbkdf2-sha256$<迭代次数>$<salt>$<hash>`；登录成功若发现存储迭代次数低于当前配置会自动重算（平滑升级）。
2. **胡椒**：设置 `AUTH_PEPPER` 后，PBKDF2 输入为 `HMAC-SHA256(pepper, 密码)`；
   数据库整体泄露时，没有 pepper 无法离线爆破。
3. **用户名枚举防护**：不存在的用户也会执行一次等价 PBKDF2，响应时间与错误文案均一致。
4. **限流**：登录（IP+用户名 10 次/15 分钟，锁 15 分钟）、注册（IP 20 次/小时）、
   改密与删号（IP+用户 10 次/小时）；触发返回 429 + `Retry-After`。
5. **会话**：32 字节随机 token，仅返回给客户端；服务端只存摘要；支持滑动续期与全量吊销；
   改密后所有旧会话立即失效。
6. **CORS**：只对白名单来源回显 `Access-Control-Allow-Origin`（并带 `Vary: Origin`），
   未授权来源浏览器直接拦截；跨域携带 Cookie 时不做 `ACAO: *`。
7. **输入约束**：强制 `application/json`、`Content-Length` 与实际字节双重校验上限、
   拒绝 `__proto__` / `constructor` / `prototype` 顶层键、D1 全部使用参数化绑定。
8. **最小泄露**：响应只含 `PublicUser`（绝不含哈希）；未知异常统一 500 且详情只进日志；
   接口带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`。
9. **账号自治**：用户可导出全部数据、可自助注销（密码二次确认 + 级联删除）。

---

## 9. CPU 与免费额度适配

| 项目 | 说明 |
| --- | --- |
| PBKDF2 CPU | 100000 次迭代 ≈ **28 ms** 原生 CPU（本机实测，Workers 同为原生实现）。Workers 免费版单请求 CPU 上限约 10 ms，注册/登录可能超限；**免费版建议把 `PBKDF2_ITERATIONS` 降到 `25000`**，或升级 Workers Paid（$5/月，30 s CPU）后保持 100000+。 |
| D1 读 | 每次鉴权 1 次会话查询 + 1 次用户查询（走主键，索引齐全）；登录额外 1 次用户名查询。 |
| D1 写 | 会话滑动续期走 `ctx.waitUntil`，不阻塞响应；`last_login_at`、清理动作同样异步。 |
| 定时清理 | Cron 每天一次批量删过期会话与陈旧计数行，避免 D1 行数无限增长。 |
| 请求配额 | 10 万请求/天（免费）对本项目体量足够；静态资源仍由 Pages/CDN 承担，Worker 只处理 `/api/*`。 |

优化开关（按需）：

- 若只想同域用 Cookie（不跨域），可删掉前端 token 逻辑，改为纯 `HttpOnly` Cookie，抗 XSS 更强；
- 若并发冲突成为现实问题，前端只需在 `PUT` 上带 `If-Match: <revision>`（后端已支持 409 + 当前数据）；
- QPS 大幅上升时，把 `auth_attempts` 限流换成 Cloudflare **Rate Limiting 绑定**或 **Durable Object**。

---

## 10. 运维

```bash
pnpm exec wrangler tail                       # 实时日志
pnpm exec wrangler d1 execute autumn-autools --remote \
  --command "SELECT COUNT(*) AS users FROM users"
pnpm exec wrangler d1 export autumn-autools --remote --output backup.sql   # 备份
```

- **Pepper 轮换**：`AUTH_PEPPER` 一旦更换，所有既有口令都无法校验（用户需重新设置密码）。
  如需轮换，应先实现「双 pepper 校验 + 登录时重算」再切换。
- **删除用户**：用户自助注销即可；管理员清理可直接 `DELETE FROM users WHERE id = ?`，
  再按 §7 表结构手工清理 `user_settings` / `user_plans` / `sessions`。
- **监控**：`[observability] enabled = true` 已在 `wrangler.toml` 打开；
  `/api/health` 可接入外部拨测。

---

## 11. 上线检查清单

- [ ] `wrangler.toml` 的 `database_id` 已替换为真实 D1 id
- [ ] `wrangler d1 migrations apply --remote` 已执行
- [ ] `AUTH_PEPPER` 已通过 `wrangler secret put` 设置并单独留存
- [ ] `ALLOWED_ORIGINS` 已列出正式站点来源（不要图省事写 `*`）
- [ ] `PBKDF2_ITERATIONS` 已按套餐调整（免费版 25000 / 付费版 100000+）
- [ ] `ENVIRONMENT=production`（确保 `Secure` Cookie）
- [ ] 前端已配置 `VITE_BACKEND_BASE_URL`（跨域时）并重新构建
- [ ] `/api/health` 返回 `database: "ok"`
- [ ] 已实测注册 → 登录 → 排课表页保存 → 换设备登录可见

---

## 12. 常见问题

**Q：浏览器报 CORS 错误 / 预检失败？**
把静态站点的**完整来源**（含协议与端口，如 `https://xxx.pages.dev`）加入 `ALLOWED_ORIGINS`；
`http://localhost:3000` 与 `http://127.0.0.1:3000` 是不同来源，写端口时别只写一个。

**Q：登录后刷新页面又变成未登录？**
跨域部署时浏览器可能拦截第三方 Cookie（Safari 默认、Chrome 逐步收紧）。本项目前端用的是
`Authorization: Bearer` + localStorage，不依赖 Cookie；若仍失败，检查浏览器是否禁用了 localStorage、
或 `VITE_BACKEND_BASE_URL` 是否写错（末尾斜杠会被自动去掉，但路径不要写 `/api`）。

**Q：`wrangler dev` 报 D1 错误？**
本地模式用的是占位 `database_id` 也需存在；先执行 `wrangler d1 migrations apply autumn-autools --local`。

**Q：返回 429 且无法登录？**
触发了限流锁定（默认 15 分钟）。可等待，或在 D1 中
`DELETE FROM auth_attempts WHERE key LIKE 'login:%'` 立即解锁。

**Q：想彻底关掉云端功能？**
前端设 `VITE_BACKEND_ENABLED=false` 重新构建即可回到纯本地单机模式（后端可直接不部署）。

**Q：能否用 GitHub / 微信等第三方登录？**
当前为用户名 + 密码（无需邮件服务，适合校园内网场景）。若要接 GitHub OAuth，
在 `routes/auth.ts` 旁新增 `oauth.ts`，把 `users` 增加 `provider` / `provider_uid` 列即可复用现有会话与数据层。
