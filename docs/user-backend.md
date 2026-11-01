# 用户后端接入说明（前端视角）

> 后端实现与部署见 [`backend/README.md`](../backend/README.md)。
> 本文说明**前端如何接入、数据怎么流、如何本地联调与排错**。

## 1. 架构总览

```
┌─────────────────────────── Cloudflare ───────────────────────────┐
│                                                                  │
│  Pages / 静态托管            Workers（backend/）                  │
│  ┌────────────────┐   /api   ┌──────────────────────────────┐    │
│  │ app/ (React)   │ ───────▶ │ fetch 路由 → D1 (SQLite)      │    │
│  │  ├ 首页         │          │   users / sessions            │    │
│  │  └ 排课表 /ca   │ ◀─────── │   user_settings / user_plans  │    │
│  └────────────────┘  JSON    │  Web Crypto(PBKDF2) · Cron    │    │
│         │                    └──────────────────────────────┘    │
│         └── localStorage（本机镜像 / 未登录模式）                 │
└──────────────────────────────────────────────────────────────────┘
```

- **前端不感知后端存在**：设置与方案依旧只依赖 `SettingsProvider` / `PlanProvider` 两个异步接口；
- **登录是可选的**：未登录 = 与接入前完全一致的单机模式；登录后自动变为「云端优先 + 本机镜像」；
- **Cookie 与 Bearer 双通道**：跨域部署用 Bearer（localStorage），同域部署可用 HttpOnly Cookie。

## 2. 前端改动清单

### 新增

| 文件 | 作用 |
| --- | --- |
| `app/src/services/api.ts` | HTTP 客户端：BASE_URL 拼装、Bearer 注入、错误信封解析、401 自动登出、超时/网络失败降级 |
| `app/src/services/cloudProvider.ts` | 通用「云端优先 + 本机镜像」存储实现（settings / plans 共用） |
| `app/src/auth/types.ts` | `AuthUser` / `AuthSessionResponse` / `BackendMeta` |
| `app/src/auth/tokenStore.ts` | 登录凭据的 localStorage 读写 + `getAuthSnapshot()`（供存储层判断账号作用域） |
| `app/src/auth/api.ts` | 认证与账号接口封装（注册/登录/注销/me/meta/导出/删号） |
| `app/src/auth/AuthContext.tsx` | 登录态上下文：挂载校验、login/register/logout/refresh |
| `app/src/auth/AccountPanel.tsx` + `.css` | 账号面板（登录/注册表单 + 已登录管理），首页与排课表页共用 |
| `app/src/auth/AccountDialog.tsx` | 首页导航栏用的账号弹窗（portal 渲染） |
| `app/.env.example` | `VITE_BACKEND_BASE_URL` / `VITE_BACKEND_ENABLED` 模板 |

### 修改

| 文件 | 改动 |
| --- | --- |
| `app/src/config.ts` | 新增 `BACKEND_BASE_URL`、`BACKEND_ENABLED` 常量 |
| `app/src/settings/provider.ts` | 原来的「远程实现注释骨架」落地为 `RemoteSettingsProvider`，并新增 `HybridSettingsProvider`（默认实例） |
| `app/src/plans/provider.ts` | 同上；`HybridPlanProvider` 额外在登录态填入 `PlanState.ownerId` |
| `app/src/settings/SettingsContext.tsx` | 按 `useAuth().user.id` 变化重新加载（登录/退出/切号），切换瞬间先清空避免串数据 |
| `app/src/plans/PlansContext.tsx` | 同上（保留旧版 `planClassGroups`/`classModeGroups` 迁移逻辑） |
| `app/src/App.tsx` | `AuthContextProvider` 置于最外层（设置/方案上下文依赖它） |
| `app/src/pages/HomePage.tsx` | 顶部导航新增「登录 / 注册」入口（登录后显示昵称 + 云端） |
| `app/src/pages/CaBetaPage.tsx` | 「用户设置」卡片内嵌账号面板，副标题随登录态显示「云端同步已开启 / 本地自动保存」 |
| `app/vite.config.ts` | 开发代理：`/api` → `http://127.0.0.1:8787`（wrangler dev） |

## 3. 数据流

### 未登录（默认，等价于接入前）

```
load() → localStorage("autumn-user-settings" / "autumn-plan-state")
save() → 同一键，不发任何网络请求
```

### 登录后

```
load() → GET /api/{settings|plans}
          ├── 云端有数据 → 写入本机镜像键（autumn-*-state@u:<userId>）后返回
          └── 云端为空   → 把匿名本地数据一次性 PUT 上云（老用户首登迁移），再返回
save() → 先写本机镜像（离线不丢） → 再 PUT 云端（失败仅告警，界面照常可用）
```

### 退出登录 / 切换账号

```
user.id 变化 → SettingsContext / PlansContext 重新加载对应作用域
                ├── 未登录 → 匿名键（与登录前的本机数据完全一致）
                └── 另一账号 → 该账号的镜像键 + 云端数据
```

本机镜像按 `<键>@u:<userId>` 分目录，因此**同一浏览器上多账号数据互不串号**。

### 降级策略

| 场景 | 行为 |
| --- | --- |
| 后端不可达 / 超时（15 s） | `console.warn` + 读本机镜像，单机功能不受影响 |
| 云端 401（token 过期 / 账号已删） | `api.ts` 自动清理本地凭据 → 界面回到未登录态（本机数据仍在） |
| 云端 413 / 409 / 500 | 记录告警，保留本机副本；下次修改会再次尝试上云 |
| `VITE_BACKEND_ENABLED=false` | 完全不发请求（连登录态校验都不做），纯本地模式 |

## 4. 前端存储键一览

| 键 | 内容 |
| --- | --- |
| `autumn-auth-token` | 会话 token（Bearer） |
| `autumn-auth-user` | 用户资料缓存（刷新后立即渲染登录态，随后由 `/api/auth/me` 校正） |
| `autumn-user-settings` | 未登录时的设置（与接入前同名，老数据直接续用） |
| `autumn-user-settings@u:<id>` | 登录用户的设置本机镜像 |
| `autumn-plan-state` | 未登录时的配课方案 |
| `autumn-plan-state@u:<id>` | 登录用户的方案本机镜像 |
| `autumn-ca-guide-seen` | 排课表新手引导是否已读（与后端无关） |

## 5. 配置

`app/.env.local`（模板见 `app/.env.example`）：

```bash
# 留空 = 同源 /api（本地开发经 vite 代理；生产建议 Pages + Workers 同域）
VITE_BACKEND_BASE_URL=
# 跨域部署示例（末尾无斜杠，不含 /api）
# VITE_BACKEND_BASE_URL=https://autumn-autools-api.xxx.workers.dev

VITE_BACKEND_ENABLED=true
```

跨域部署时记得把静态站点来源加入后端 `ALLOWED_ORIGINS`。

## 6. 本地联调

```bash
# 终端 A：后端
cd backend && pnpm install && pnpm exec wrangler d1 migrations apply autumn-autools --local && pnpm run dev

# 终端 B：前端
cd app && pnpm install && pnpm run dev     # http://localhost:3000
```

- 前端 `/api/*` 由 vite 代理到 `127.0.0.1:8787`，无跨域、无 Cookie 问题；
- 后端不需要联网（除首次安装 wrangler）；不启后端时前端会静默降级为纯本地模式；
- 接口自测：`cd backend && node scripts/smoke-test.mjs`（零依赖，72 项断言）。

## 7. 并发与多设备

- 默认策略：**最后写入者获胜**（`PUT` 不带 `If-Match`），适合单人多设备的使用场景；
- 后端已支持乐观锁：`PUT /api/settings` 带 `If-Match: <revision>`，
  版本不一致返回 `409 revision_conflict`，`error.details` 内含服务端当前数据；
- 若日后要做「检测到冲突，选择保留哪一份」的交互，只需在 `HybridProvider.save()` 中
  记录上次 `ETag` 并在 409 时提示用户，无需改动后端。

## 8. 迁移与兼容

| 情况 | 行为 |
| --- | --- |
| 老用户（本地已有数据）首次登录 | 若云端为空则自动把本地匿名数据上云，不丢配置 |
| 同一浏览器多账号 | 匿名键 + 每账号镜像键，互不覆盖 |
| 退出登录 | 回到匿名本机数据（登录账号的数据仍留在其镜像键与云端） |
| 关闭后端 | 删除/忽略 `VITE_BACKEND_BASE_URL` 或设 `VITE_BACKEND_ENABLED=false`，行为与接入前一致 |
| 账号注销 | 云端数据级联删除；本机镜像键保留（可由浏览器清理，或后续加「清除本机缓存」功能） |

## 9. 前端手测清单

1. **未登录**：排课表页添加课程 → 刷新 → 数据恢复；Network 面板无 `/api` 请求（除 `/api/meta`）。
2. **注册**：首页导航「登录 / 注册」→ 注册 → 提示「注册成功，云端同步已开启」，导航显示昵称（云端）。
3. **上云**：登录后改校区偏好 / 加课程 → Network 可见 `PUT /api/settings`、`PUT /api/plans` 且 200。
4. **跨设备**：另一浏览器（或隐身窗口）注册/登录同账号 → 看到同一份候选课程与偏好。
5. **隔离**：同一浏览器登录另一个账号 → 显示该账号的数据；退出 → 回到匿名数据。
6. **降级**：停掉后端 → 页面不报错，操作仍生效（控制台有「云端不可用，已回退到本机镜像」告警）。
7. **过期**：在 D1 中删除该用户的 sessions 行 → 下次刷新自动回到未登录态。
8. **注销**：账号面板「注销账号」→ 输入密码 → 云端数据删除、登录态清空、该账号无法再登录。
9. **关闭开关**：`VITE_BACKEND_ENABLED=false` 重新构建 → 账号面板显示「纯本地模式」，无任何 `/api` 请求。

## 10. 后续可选扩展

- **分享方案链接**：`user_plans.data` 已能整体导出，可加 `POST /api/share` 生成只读短链（配合 KV 存快照）；
- **多方案管理**：`PlanState.savedPlans` 字段已预留，可拆成独立表做增量同步；
- **课程数据后端化**：`app/src/hooks/useCourseData.ts` 目前全量加载 1.9 MB JSON，
  可在 Worker 侧加 `/api/courses?keyword=` 做检索下沉（D1 建索引或 R2 存 JSON）；
- **第三方登录**：见 `backend/README.md` §12 的 GitHub OAuth 说明；
- **同域 Cookie 模式**：若把前端也放到 Cloudflare 同域，可删除 token 逻辑，改用纯 `HttpOnly` Cookie（后端已下发）。
