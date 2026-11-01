# 秋功前端（AutumnAUTools · `app/`）

React 版前端（Vite + React 19 + TypeScript + react-router-dom v7）。业务与技术背景见仓库根目录的 `AGENTS.md`。

## 开发与构建

```bash
pnpm install
pnpm run dev                 # http://localhost:3000（默认端口，可用 --port N 指定）
pnpm run build               # tsc -b && vite build → dist/
pnpm run preview
pnpm run sync:resources      # 扫描 public/resources 生成 files.json（学习资料页用）
```

## 用户后端接入（Cloudflare Workers + D1）

前端支持接入 `backend/`（Cloudflare Workers + D1）提供的用户账号与云端同步：

- **环境变量**（模板见 `.env.example`，本地复制为 `.env.local`）：
  - `VITE_BACKEND_BASE_URL`：Worker 地址；**留空 = 同源 `/api`**（推荐）。跨域部署时填完整地址（不含 `/api`），并把该静态站来源加入后端 `ALLOWED_ORIGINS`。
  - `VITE_BACKEND_ENABLED`：`false` 时完全关闭云端（不发任何 `/api` 请求，回退为纯 localStorage 单机模式）。
- **本地联调**：`vite.config.ts` 已把 `/api` 代理到 `http://127.0.0.1:8787`（`backend/` 的 `pnpm run dev`），因此本地开发无需配置环境变量，也不涉及跨域。
- **代码位置**：
  - `src/auth/`：登录态（`AuthContext`）、凭据存储（`tokenStore`）、账号面板（`AccountPanel` / `AccountDialog`，入口在首页导航与排课表页「用户设置」卡片）；
  - `src/services/api.ts`：HTTP 客户端（Bearer 注入、错误信封、401 自动登出、超时/网络失败降级）；
  - `src/services/cloudProvider.ts`：通用「云端优先 + 本机镜像」存储（未登录走匿名 localStorage；登录后云端为准，本机按 `@u:<userId>` 分键做镜像，离线可用且多账号不串号）；
  - `src/settings/provider.ts`、`src/plans/provider.ts`：设置与配课方案的 Provider 实现（`Hybrid*` 为默认实例）。
- **注意**：登录态变化会自动触发设置/方案按账号重新加载；后端不可用时前端静默降级，单机功能不受影响。

后端部署、API 契约、安全与免费额度适配见 `backend/README.md`；前端数据流、联调步骤与手测清单见 `docs/user-backend.md`。

类型校验：`node node_modules/typescript/bin/tsc -b`（或 `pnpm run build` 的第一段）。

---

> 以下为 Vite 脚手架模板原文，保留供参考。

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
