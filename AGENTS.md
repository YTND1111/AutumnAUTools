# AGENTS.md — AutumnAUTools（秋功）

> 本文件面向 AI 编程助手，用于快速了解项目结构、技术栈、构建方式与开发约定。项目注释和文档以中文为主，因此本文件使用中文撰写。

## 项目概述

AutumnAUTools（中文名“秋功”）是一个面向中国农业大学课程通知单的静态 Web 查询工具。它包含：

- 一个首页（`index.html`），提供可拖拽的悬浮球与侧边栏导航；
- 一个排课表工具页（`ca.html`），支持按课程、授课教师、上课时间进行检索，自助方案排课与班级课表调用状态会持久化到 `localStorage`，刷新后自动恢复；
- 一个通知单课表预览页（`cn.html`），使用 Univer Sheets 嵌入电子表格引擎，以接近 Excel 的体验浏览并筛选原始通知单；
- 一个可复用的 iframe 悬浮窗组件（`js/FloatingWindow.js`），支持拖拽、关闭、边框缩放；
- 一个 Python 辅助脚本（`src/py/json-trans.py`），用于将 Excel 格式的课程通知单转换为前端读取的 JSON；
- 转换后的课程数据（`src/py/中国农业大学2025-2026学年春季学期通知单课表.json`）作为静态资源被前端 `fetch` 加载；
- 一个**可选的用户后端**（`backend/`，Cloudflare Workers + D1）：账号注册/登录，并把候选课程、班级课表调用、阻塞时段与偏好设置同步到云端；未登录时前端行为与纯静态站点完全一致。

早期版本为纯静态站点（无后端、无构建流水线、无框架依赖）；现已演进为 **`app/`（React 前端）+ `backend/`（Cloudflare 用户后端）** 的双层结构，`legacy/` 保留原静态实现作为归档。

## 技术栈

- **前端**：HTML5、原生 CSS3、原生 ES6+ JavaScript（描述对象为 `legacy/` 原静态站点；当前主线 `app/` 见上一节）。
  - 原静态站点不使用 React/Vue/Angular 等前端框架编写业务代码；`app/` 使用 React 19 + TypeScript + Vite（包管理器 pnpm，配置在 `app/package.json`）。
  - `cn.html` 通过 CDN 引入 Univer Sheets（内部基于 React）与 SheetJS，实现专业表格预览与筛选。
  - `legacy/` 无包管理器、无 `package.json`；`app/` 的依赖与脚本见 `app/package.json`。
- **数据脚本**：Python 3。
  - 依赖：`openpyxl`（读取 `.xlsx` 等现代 Excel 格式）。
  - 可选依赖：`xlrd`（仅在读取旧版 `.xls` 二进制格式时需要）。
- **数据格式**：Excel（源数据）→ JSON（前端消费）。
- **用户后端（可选）**：Cloudflare **Workers** + **D1**（Serverless SQLite）+ **Web Crypto**（PBKDF2-SHA256 / HMAC / SHA-256）+ **Cron Triggers** 定时清理；**零运行时依赖、零类型依赖**（devDependency 仅 `wrangler`、`typescript`，不需要 `nodejs_compat`）。详见 `backend/README.md` 与 `docs/user-backend.md`。

## 目录结构

> **归档说明（2026-08）**：原纯静态旧版站点已全部归档至 `legacy/`（页面、样式、脚本、数据与版本号工具原样保留，目录内部相对引用不变）；React 应用位于 `app/`，是当前唯一开发主线。根目录仅保留文档与许可证。**下文中 `index.html`、`ca.html`、`scripts/`、`src/py/` 等相对路径均相对于 `legacy/` 解读**（描述旧版实现），明确标注 `app/` 的除外。

```
AutumnAUTools/
├── app/                    # React 应用（Vite + React 19 + TS，当前开发主线，详见下文「React 迁移」）
│   ├── index.html          # Vite 入口 HTML（挂载 #root）
│   ├── src/                # React 源码（pages/ components/ hooks/ services/ settings/ plans/ auth/ legacy/）
│   ├── public/             # 静态资源副本（css/js/data/src/py/questionBank/resources/cn.html/legacy/*.html）
│   ├── .env.example        # 前端环境变量模板（用户后端地址与开关）
│   └── package.json        # dev / build / preview 脚本
├── backend/                # 用户后端（Cloudflare Workers + D1，零运行时依赖，详见下文「用户后端」）
│   ├── wrangler.toml       # Worker 配置：D1 绑定、环境变量、Cron、dev 端口
│   ├── migrations/         # D1 迁移 SQL（users/sessions/user_settings/user_plans/auth_attempts）
│   ├── scripts/            # d1-shim.mjs（node:sqlite 实现的 D1 桩）+ smoke-test.mjs（72 项断言）
│   ├── src/                # Worker 源码（index/router/http/crypto/session/db/ratelimit/validate/routes/）
│   └── README.md           # 后端部署、API、安全与免费额度适配说明
├── docs/                   # 专题文档
│   ├── ai-client-recommendation.md
│   └── user-backend.md     # 用户后端「前端接入」说明（数据流、契约、联调、手测清单）
├── legacy/                 # 原纯静态站点归档（不再开发，仅查阅与回滚参考）
│   ├── index.html          # 旧版首页：悬浮球 + 侧边栏导航
│   ├── ca.html             # 旧版排课表工具页
│   ├── cn.html             # 通知单课表预览页（Univer Sheets，仍被 app 以静态页方式复用）
│   ├── qbn.html            # 旧版题库首页
│   ├── floatingball-demo.html / style.css
│   ├── css/ js/ data/ questionBank/ src/
│   ├── scripts/            # 旧版版本号管理脚本（bump-*.py）与遗留页提取脚本
│   └── version-*.json      # 旧版模块版本号
├── LICENSE                 # Apache-2.0 许可证全文
├── README.md               # 项目简介（内容极简）
└── prd.md                  # 产品需求草稿
```

## React 迁移（`app/`）

项目已迁移至 React 框架，React 版位于 `app/` 子目录（Vite + React 19 + TypeScript + react-router-dom v7，由 webapp-building 技能脚手架生成）。**迁移遵循最小改动原则：原静态文件全部保留且未修改，业务 JS 零改动。**

### 迁移架构

- **路由外壳**：`app/src/App.tsx` 使用 HashRouter（`/` 首页、`/ca` 排课表、`/qbn` 题库、`/resources` 学习资料、`/cn` 整页跳转静态 `cn.html`），并以**捕获阶段**全局点击拦截把遗留 HTML 中的 `/index.html`、`/ca.html`、`/qbn.html`（含笔误 `/qn.html`）绝对链接映射为路由跳转（侧边栏在冒泡阶段有 `stopPropagation`，故必须捕获阶段）。
- **遗留页面挂载**：`app/src/legacy/LegacyPage.tsx` 按 `app/src/legacy/pages.ts` 清单工作——fetch `public/legacy/*.html`（页面 `<style>` 块 + 去除 `<script>` 的 body 内容）注入容器，再按原顺序执行原始脚本。
- **脚本执行机制**：`version-*.js` 全局常量脚本以经典 `<script>` 方式**会话内仅加载一次**（顶层 `const APP_VERSION_*` 全局词法绑定对后续所有脚本可见，重复加载会报重复声明错误）；其余页面脚本逐个 fetch 源码后在**独立函数作用域**（`new Function`）内执行，避免 SPA 重复挂载时顶层 `const`/`let` 冲突。跨脚本共享仅依赖 `window`（如 `window.createFloatingWindow`），不受影响。
- **静态资源**：`css/`、`js/`、`data/`、`src/py/`（课程 JSON/XLS/PDF）、`questionBank/`、`cn.html`、`floatingball-demo.html` 原样复制到 `app/public/`，浏览器 fetch 的相对路径全部不变。`cn.html` 及题库答题页保持独立静态页（CDN 引入 Univer Sheets），由悬浮窗 iframe 或 `/cn` 路由整页打开，未做 React 化。
- **样式**：`app/index.html` 全局引入 `/css/GlobalStyle.css`；`app/src/index.css` **故意不含 Tailwind preflight**，避免全局重置污染遗留页面样式（脚手架自带的 shadcn/ui 组件保留在 `app/src/components/ui/`，供后续原生 React 功能使用）。

### 遗留页面再生成

`public/legacy/*.html` 与 `*-inline.js` 由 `legacy/scripts/extract-legacy-pages.py` 从归档的 `legacy/index.html` / `ca.html` / `qbn.html` 提取生成（分离 `<style>`、body 结构与内联脚本）。**原页面改动后需重新运行**：

```bash
python legacy/scripts/extract-legacy-pages.py
# 若 legacy/ 下 css/js/data/src/py 等资源有更新，需同步复制到 app/public/ 对应路径
```

### React 版开发

包管理器已迁移至 **pnpm**（锁文件 `pnpm-lock.yaml`；`package.json` 声明 `packageManager: pnpm@11.18.0`）。项目级 pnpm 配置在 `app/pnpm-workspace.yaml`（pnpm 11 起 settings 不再读 `package.json` 的 `pnpm` 字段），其中通过 `allowBuilds` / `onlyBuiltDependencies` 允许 esbuild 的安装构建脚本（Vite 依赖其平台二进制，否则会报 `ERR_PNPM_IGNORED_BUILDS`）。

```bash
cd app
pnpm install         # 首次
pnpm run dev         # 开发服务器（默认 3000 端口，指定端口：pnpm run dev --port N，注意 pnpm 不需要额外的 -- 分隔符）
pnpm run build       # 生产构建 → app/dist/
```

已知限制（与原站行为一致或可接受）：`index.js` 在 document/window 上的少量监听在路由切换后残留但仅操作已分离元素，无副作用；浏览器直接请求 `/ca.html` 等路径会命中 Vite SPA 回退显示首页（正常应通过 `#/ca` 路由访问）。

### 渐进重构范例：题库页与首页已原生重写

题库页（`/qbn`）与首页（`/`）是前两个原生 React 页面，展示了遗留页 → 原生页的渐进重构模式：

- **悬浮球框架已移除（2026-09）**：原 `app/src/hooks/useFloatingBall.ts`（`js/index.js` 悬浮球逻辑的 Hook 移植：拖拽/吸附/侧边栏/rAF 合帧）与 `app/src/components/FloatingChrome.tsx`（悬浮球 + 遮罩 + 侧边栏共享框架，含各页 `SIDEBAR_LINKS`）**已整体删除**；所有 React 页面不再渲染悬浮球/遮罩/侧边栏，`app/public/css/GlobalStyle.css` 中的 `#floatingBall` 规则与 `--fb-*` 变量同步清除。仅归档页 `app/public/legacy/*.html` 仍引用的 `#PageBackdrop` / `#NavSidebar` / `#Navigater, #Tool, #News` / `.href` 样式保留（该段已在文件内注释标注，归档目录删除后可一并清理）。**React 页面的站内导航现仅由首页/题库页/学习资料页的顶部导航栏承担，排课表页 `/ca` 当前无站内跳转入口。**
- **`app/src/components/FunTabs.tsx`**：首页趣味功能选项卡。绿色光影滑动 + 阴影生长动画原样保留（光影位移直接操作 DOM style 不进状态，激活/阴影态由 useState 驱动），快速连点的定时器结算逻辑一致。
- **`app/src/components/FeeCalendar.tsx`**：窝囊费打表日历。年月状态由 useState 驱动（替代手动 innerHTML 重绘），`data/fee-days.json` 高亮日期在 useEffect 内 fetch 一次，失败按无高亮渲染（同原逻辑）。
- **`app/src/pages/QbnPage.tsx` / `HomePage.tsx` + 同名 scoped CSS**：页面内容原生 JSX。内联 `<style>` 移植为 `.qbn-page` / `.home-page` 作用域 CSS（避免通用类名污染）；站内链接改用 `<Link>`；`href="#"` 占位按钮改为 `<button>`（HashRouter 下 `#` 会误触路由）；答题页仍为独立静态页整页打开；不再加载页面用不到的 version 常量脚本。首页的 `:root` 变量与 GlobalStyle 完全一致（冗余，已省略）；三个独立 `.news-list` 包装合并为数据驱动的单列表（CSS gap 归零保持原间距）。
- **`app/src/pages/SharedPage.css`（页面骨架与“边框厚度”约定）**：首页/题库页/学习资料页原本各自复制了一份完全相同的骨架规则（`.container` / `.header` / `.logo` / `.nav-list` / `.nav-item` / `.main` / `.left-box` / `.right-box` / `.footer`，约 90 行 × 3），现统一抽到本文件，三个页面 CSS 首行 `@import "./SharedPage.css";`，页面根节点加 `layout-page` 类（如 `className="home-page layout-page"`）。
  - **踩坑记录（文字贴边框的根因）**：各页开头的 `页作用域 * { padding: 0 }`（`.home-page *`，特异性 0,1,0）会**压过 GlobalStyle.css 里的公共组件类**（`.surface-card`、`.dial-btn` 同为 0,1,0，后位胜出），把本该有的 20px / 12px 内边距清成 0 —— 表现为卡片文字紧贴卡片边框、按钮文字顶着上下边框。因此 `SharedPage.css` 用 `.layout-page .surface-card`（0,2,0）这一级特异性把内边距显式补回；**新增页面若沿用 `页作用域 * { padding: 0 }` 写法并用到 GlobalStyle 的组件类，必须同样补回内边距**。
  - 分隔线类元素（`.title-bar` / `.dial-title`）统一遵循“文字与线之间留 8~14px”：卡片内标题改为通栏条（`margin: -20px -20px 14px; padding: 14px 20px 12px` + 渐变底 + 2px 主色分隔线），`.dial-title` 在 GlobalStyle 中加了 `line-height: 1.5; padding-bottom: 8px`，避免分隔线压在文字基线上像下划线。

后续重写排课表页时遵循同一模式：页面内容 → `pages/XxxPage.tsx` + 作用域 CSS，业务脚本逐步 Hook 化（排课表页的 `CourseArrangement.js` 约 2400 行，建议按「课程搜索 / 候选池 / 方案生成 / 课表渲染」分模块拆解，而非一次性移植）。原公共 chrome 组件 `FloatingChrome` 已随悬浮球移除，页面无需再挂载公共框架。

### 版本号与公告（React 版）

React 迁移后，旧站 `version-*.json` + bump 脚本的版本管理体系**不再适用于 `app/`**（旧体系已随旧站归档至 `legacy/`）。新约定：

- **版本号单一事实来源：`app/src/config.ts`**。`APP_VERSION_HOME`（首页/全局，展示于首页页脚「秋功 vX.Y.Z」）、`APP_VERSION_CA`（排课表工具，展示于排课表页顶栏右上角「排课表工具 vX.Y.Z」，位置/样式对齐原站 `#VersionLabel`）、`APP_VERSION_GPA`（绩点计算工具，展示于绩点计算页页脚）。发版时改这些常量即可，随构建生效。
- **业务代码无需手动版本戳**：Vite 产物自带内容指纹（`assets/index-<hash>.js|css`），缓存破坏免费获得。
- **课程数据缓存戳**：`COURSE_DATA_VERSION` 派生自 `APP_VERSION_CA`（fetch 课程 JSON 时以 `?v=` 附加），排课表发版即自动刷新课程数据缓存，无需单独维护。
- **首页公告**：`config.ts` 的 `ANNOUNCEMENTS` 数组（`{date, title, content}`），仅在首页顶栏下方渲染公告条（`.announcement-bar`），空数组则不渲染；新公告加在数组开头。首页「最新更新」列表（`HomePage.tsx` 的 `NEWS_ITEMS`）发版时手动同步一条。

### 用户设置接口层（已接入云端后端）

设置读写统一走 **`app/src/settings/`** 的 Provider 抽象，业务代码不感知存储位置：

- **`types.ts`**：`UserSettings`（当前含 `campusPreference`；旧 `scheduleMode` 字段已随「模式切换」一并移除）与 `DEFAULT_SETTINGS`。
- **`provider.ts`**：`SettingsProvider` 异步接口（`load` / `save`），三种实现——`LocalStorageSettingsProvider`（键 `autumn-user-settings`）、`RemoteSettingsProvider`（HTTP `/api/settings`）、**`HybridSettingsProvider`（默认实例，云端优先 + 本机镜像）**；换实现只需改文件末尾 `settingsProvider` 那一行。
- **`SettingsContext.tsx`**：`SettingsContextProvider`（已挂载在 `App.tsx` 的 Routes 外层）+ `useSettings()` Hook；挂载时异步加载并与默认值合并，更新时乐观写入内存并防抖 300ms 持久化；**按 `useAuth().user.id` 变化重新加载**（登录/退出/切号），切换瞬间先清空为默认值避免串数据。

### 排课表原生重构（已上线，正式路由 `/ca`）

- **`/ca` 现由原生重构版（`app/src/pages/CaBetaPage.tsx`）提供服务**，为「自助方案排课」**单视图**：原 plan / class 双模式与顶栏模式切换已移除（class 模式逻辑直接删除归档），「班级课表调用」保留为右侧栏内的**子功能区**（整班调用默认参与排课）。`/ca-beta` 重定向到 `/ca`；原遗留挂载退至 `/ca-legacy`（无入口，仅回滚兜底，稳定后可连同 `app/src/legacy/` 与 `app/public/legacy/` 一起删除）。组件/样式名中的 `beta` 为历史命名，内部使用无妨。
- **页面布局对齐原站双栏**：`.beta-main` 为 `minmax(0,1fr) 380px` 网格（对应原站 `#Layout`）——左栏 `.beta-schedule` 放课表网格（`tt-grid` 保持 `min-width: 828px`，过宽时左栏横向滚动，同原站 `#ScheduleSection`），右栏 `.beta-sidebar` 纵向堆叠：候选课程卡片池 → 班级课表调用 → 方案生成 → 用户设置说明卡片（对应原站 `#Sidebar`）；视口 <1100px 时回退单栏（原站无此行为，为窄屏易用性增强）。
- 已完成：**搜索模块**——`app/src/components/SearchBar.tsx` 通用搜索建议组件（课程/班级检索共用，忠实还原原交互：50 条上限、加载中/无匹配提示、点击外部收起、清除按钮）；数据层 `app/src/services/courseData.ts`（纯检索函数，忠实移植 `normalize`/`splitClasses`/`findCourseCandidates`/`findClassTimetableCandidates`）+ `app/src/hooks/useCourseData.ts`（JSON 加载，版本戳常量在 `app/src/config.ts`，需与 `version-ca.json` 同步）。**顶栏为课程检索；班级检索位于侧栏「班级课表调用」卡片内**（子功能区自带检索框）。班级检索/整班调用会过滤「临班」等非真实班级占位标签（常量 `NON_CLASS_NAME`，数据中通识课常见“临班”不视为班级，旧存“临班”组加载时自动丢弃）。
- `CaBetaPage.tsx` 同时是**设置接口的使用页**：校区偏好经 `useSettings()` 持久化（方案生成面板内分段按钮直接设定，刷新后保留；UI 不再暴露「接口/后端就绪」类开发文案）。
- 已完成：**候选课程卡片池**——`app/src/components/CourseCardPool.tsx` + `app/src/hooks/usePlanPool.ts`。卡片 = 课程（编号+名称），教学班列表（options）不持久化、恢复时从课程数据水合重建（无匹配自动丢弃，对应原站学期切换后旧卡片失效）；参与排课开关与教师/校区/时间段/班级四个筛选维度忠实对齐原站 `togglePlanFilter` 语义（**某维度 enabled 集合为空 = 全部放行**）；展开区额外提供教学班列表（置灰 = 被筛选过滤，原站无此列表，为易用性增强；每行展示「限选人数」）。
- 方案状态走 **`app/src/plans/` 的 PlanProvider 抽象**（与 settings 层同构）：`types.ts`（`PlanState` 含 `ownerId` 字段——登录后由 `HybridPlanProvider` 自动填充为后端用户 id；`selectedWeek` 为课表周次定位；`blockedCells/blockedDays/blockedPeriods` 阻塞时段；`classGroups` 班级课表调用组）、`provider.ts`（`LocalStoragePlanProvider`，键 `autumn-plan-state`；`RemotePlanProvider`（HTTP `/api/plans`）；**`HybridPlanProvider`（默认实例，云端优先 + 本机镜像）**）、`PlansContext.tsx`（`PlansContextProvider` 已挂载于 `App.tsx` + `usePlans()`，乐观更新 + 防抖 300ms 持久化；按 `useAuth().user.id` 变化重新加载；**加载时仅合并当前版本已知字段**并自动丢弃遗留键——旧版 `planClassGroups`/`classModeGroups` 双池会自动迁移合并为新 `classGroups`）。**多用户配课方案的后端接入点即在此层，现已落地（见下文「用户后端」）**。
- 已完成：**课表网格**——`app/src/services/scheduleParse.ts`（时间/周次解析、区间合并、冲突检测、冲突文案，全部忠实移植 `js/CourseArrangement.js` 同名函数；小节 1-12 → 大节 0-5 映射）、`app/src/hooks/useTimetable.ts` + `app/src/components/TimetableGrid.tsx`。6 大节 × 7 天网格、周次定位 chips（经 PlanProvider 持久化）、格子内多课程按最早开课周排序虚线分隔、冲突块红色高亮 + 网格下方冲突文案汇总（与原站 `formatConflictMessage` 一致）。网格显示源 = 激活方案课程 + 班级课表调用组固定占用（均无且未生成时走过渡预览：每张卡片一个教学班、点击块循环切换，会话态）。
- 已完成：**方案生成**——`app/src/services/planGenerator.ts`（纯函数：四维筛选 + 校区偏好 + 阻塞时段候选过滤 → 回溯枚举，pairwise 全学期冲突检测，无冲突/冲突方案各至多 20 套，忠实移植 `generatePlans()`；班级组固定占用 `fixedCourses` 已接入）、`app/src/hooks/usePlanGenerator.ts`（生成结果会话态——原站亦不持久化；`activePlanId` 经 PlanProvider 持久化；校区偏好变化自动重新生成）、`app/src/components/PlanGeneratorPanel.tsx`（UI：偏好设置集中收纳——校区偏好分段按钮直接设定 / 时间段偏好编辑开关 / 重置偏好，其下为**全宽「生成方案」主操作大按钮**，再下为方案候选 pills 无冲突/冲突切换）。校区偏好**复用设置层** `settings.campusPreference`（不再单设状态）；阻塞时段由网格偏好编辑模式维护（编辑态点击格子/行头/列头切换阻塞，闪烁动画 + 红色阻塞标记，与原站 `planPrefEditMode` 一致）。
- 已完成：**班级课表调用（子功能区）**——`app/src/hooks/useClassGroups.ts` + `app/src/components/ClassGroupSection.tsx`。语义：班级检索选中即整班调用，**默认参与排课**（即原「复制到方案排课」行为内建，无需单独复制或切换模式）——激活组的非排除课程作为固定占用显示于课表并参与方案生成避让；组课程列表不持久化、按班级名从课程数据重建（`courseMatchesClass` 忠实移植，poolKey 去重，学期切换后无匹配自动丢弃）；单门课程排除/恢复（自动激活整组）、取消整班、全选/一键清除、组冲突红色标记（仅组内计算；方案课程冲突已由网格高亮覆盖）。
- UI 细节：检索框 **hover 高亮**（绿色描边 + 光晕）；课表头部工具行右侧提供「**导出当前课表 (.txt)**」按钮（`app/src/services/timetableExport.ts`，格式/去重/文件名与旧站 `exportTimetable()` 一致，导出源 = 当前网格显示课程）。
- **修复（v2.0.2）：只用班级课表、不加自选卡片时无法生成方案**。根因是 `services/planGenerator.ts` 在「零激活卡片」时直接返回错误，即便 `fixedCourses`（班级课表固定占用）已存在。修复后：
  - 零激活卡片 + 有固定占用 → 固定占用本身就是唯一方案（按 poolKey 去重；固定占用内部互相冲突时归入「冲突方案」，由网格标红），不再报「不存在满足要求的课程方案」；
  - 零卡片 + 零固定占用 → 错误文案改为可操作的「请先添加课程卡片，或调用班级课表后再生成方案」；
  - `CaBetaPage.tsx` 的网格显示源改为 `dedupePlanCourses([...activePlanCourses, ...fixedCourses])`，避免仅班级课表时同一门课被画两遍；
  - `usePlanGenerator.ts` 的校区偏好自动重算条件放宽为「有卡片或固定占用」；
  - `components/TimetableGrid.tsx` 的空态提示改为看「网格是否已有课程块」（`hasBlocks`），仅班级课表时不再显示误导性的「先添加卡片」文案，副标题显示「仅班级课表固定占用」。
- **新增（v2.0.3）：方案生成面板 →「导入到绩点规划 →」**。`PlanGeneratorPanel` 底部的按钮（`canExportToGpa = hasGenerated && gridDisplayCourses.length > 0`）调用 `CaBetaPage.handleExportToGpa`：按 `coursePoolKey` 回查通知单学分 → 按课程编号去重 → 写入 `services/planHandoff.ts` 的 sessionStorage → `navigate("/gpa")`；查不到学分的课程计入 `missing`，在绩点页的状态提示里报数。样式在 `CaBetaPage.css` 的 `.plan-handoff*`。
- 已完成：**交互式新手引导**——`app/src/components/SpotlightGuide.tsx`（portal 渲染：目标四周压暗 + 高亮框 + 底部引导面板，目标区保持可交互）。步骤流程：基础介绍 → 课程检索与卡片定制 → 班级课表调用与定制 → 偏好设置 → 课表导出；**首次访问自动弹出**（`localStorage` 键 `autumn-ca-guide-seen` 记录已看过），「用户设置」卡片提供「查看新手引导」随时重开；每步可点「自动演示」（自动添加示例课程/班级〔示例班级固定为「试验261」〕、示范校区与阻塞时段、真实导出 txt），引导结束时自动撤销全部演示数据，不影响真实排课。引导面板与「查看新手引导」入口旁均带「引导内容由 AI 生成」声明水印。
- **站外链接入口**：顶栏检索框下方 `.beta-ext-row` 提供「CAU选课助手」外链按钮（`ExternalLink` 渲染，地址常量见 `config.ts` 的 `CAU_COURSE_ASSISTANT_URL`），按钮左侧为常驻外链提醒文案；点击时由全局 `ExternalLinkGuard` 弹出风险提醒（见下文「站外链接与外链风险提醒」）。

### 学习资料下载页（`/resources`，纯静态）

- **页面**：`app/src/pages/ResourcesPage.tsx` + `ResourcesPage.css`，路由 `/resources`；首页/题库页顶部导航均已加入「学习资料」入口（原悬浮球侧边栏已移除）。
- **数据 = manifest + files 双 JSON 合并**：
  - `app/public/resources/manifest.json`：**人工维护**的清单（`groups` 按课程/学科分组；`items` 字段含 `id/name/description/type/file`，`file` 为站点根相对路径），其目录内 `README.txt` 有完整字段约定与上架步骤；
  - `app/public/resources/files.json`：由 `app/scripts/sync-resources.mjs`（npm script `pnpm sync:resources`）扫描 resources 目录自动生成（真实大小 + 存在性校验），页面合并后展示真实文件大小；**条目文件在磁盘缺失时自动标记「文件缺失」并禁用下载**，防止 404 链接上架。
- **页面能力**：分组折叠、全库搜索（课程/名称/描述/年份）、类型徽标（PDF/WORD/EXCEL/PPT/压缩包等，`services/resources.ts` 的 `TYPE_META`）、本机下载计数（localStorage 键 `autumn-res-dl:<id>`）、**PDF 在线预览**（iframe 弹层，原生渲染）。
- **上架一份资料**：文件放入 `public/resources/`（建议按课程建子目录）→ `manifest.json` 登记分组/条目 → `pnpm sync:resources` 重新生成 files.json 并交叉校验（缺失引用告警、未登记文件提示）。
- `resources/demo/` 为占位演示（最小 PDF + 说明 txt，`manifest.json` 的 `demo` 组），正式上架后删除对应组与文件夹。

### 绩点计算页（`/gpa`，原生 React）

- **页面**：`app/src/pages/GpaPage.tsx` + `GpaPage.css`，路由 `/gpa`；入口 = 首页「快捷入口」的「绩点计算」大按钮 + 首页/题库/学习资料/绩点计算四页顶部导航（导航项在四个页面里各写一份，改动需同步四处）。
- **规则依据（已对照官方原文）**：中农大教字〔2022〕5号《全日制普通本科学生学籍管理规定》第十五条 + 本科生院《本科成绩单显示与绩点计算规则》。要点：等级制 A+…F 对应绩点 4.0 / 4.0 / 3.7 / 3.3 / 3.0 / 2.7 / 2.3 / 2.0 / 1.5 / 1.0 / 0，EX、P、N 不计入，inv（作弊/违纪）按 0 绩点计入；`课程学分绩点 = 课程绩点 × 学分`、`GPA = ∑课程学分绩点 ÷ ∑学分`，四舍五入保留 2 位；**普通通识课、核心通识课与 EX/P/N 不纳入计算**；学校按「必修课 GPA」与「总 GPA」两种方式评定；同一门课程（**课程编号**一致）重修时，成绩单口径取最高成绩、排名口径取首次修读。**学校成绩单只显示等级、无百分制平均分**，因此主输入是等级下拉，百分制仅在粘贴文本时按官方区间辅助换算。
- **计算层**：`services/gpaRules.ts`（等级↔绩点、百分制→等级、`COURSE_KINDS` 课程类型与计入规则、`formatGpa`）+ `services/gpaCalc.ts`（纯函数：按课程号去重（无课程号退化为课程名）、best/first 两种重修口径、分别汇总总 GPA 与必修 GPA、给出每行「未计入原因」文案）。
- **录入层**：`services/transcriptParse.ts` —— 粘贴文本逐行解析，兼容成绩单表格行、Excel 制表符、极简行（课程名 学分 成绩）、五级制（优秀/良好/中等/及格/不及格）与二级制（通过/不通过/免修）；启发式为「字母等级优先 → 五级/二级制词 → 0–100 整数百分比」，学分取成绩左侧最近的 0.5–20 数值，课程号识别 5 位以上数字或字母+数字；无法确定的行整行跳过并在界面列出原因（表头行单独归类）。**PDF 文件解析未接入**（见「已知待办」）。
- **持久化**：`hooks/useGpaState.ts`，localStorage 键 `autumn-gpa-state`，结构 `{version:1, activeTermId, retakeRule, terms:[{id,name,records}]}`——多学期分别存档，结果卡另给「全部学期累计」（跨学期合并后同口径计算，同一课程跨学期重修同样去重）。加载时对等级/课程类型/学分做白名单校验，脏数据自动丢弃。**未接入用户后端**，接云端时替换本文件的读写实现即可（与 settings/plans 的 Provider 思路一致）。
- **导出**：`services/gpaExport.ts`（`buildGpaTxt` / `downloadGpaTxt`），格式与课表导出同风格（标题 + 逐门明细 + 汇总 + 依据），文件名 `绩点清单_YYYY-MM-DD_HH-mm.txt`。
- **UI 细节**：左栏 = 快速添加行（课程名/学分/等级/类型）→ 可折叠「批量粘贴导入」→ 成绩表格（行内可改课程名、课程号、学分、等级、类型，勾选「计入」、删除；未计入行淡黄底并显示原因；重修行带「重修」标签）；右栏 = 结果卡（总 GPA 大字 / 必修 GPA / 未计入门数 / 本页课程 / 全部学期累计）→ 重修口径分段按钮 → 学期选择·重命名·新建·删除 → 导出/清空 → 规则说明卡（官方等级对照 chips + 两条官方来源外链 + 免责声明）。课程名的输入在失焦/回车时提交（草稿态），避免边删边写导致空名记录落盘。

### 目标 GPA 规划（`/gpa` 页内，反解所需成绩组合）

- **面板**：`app/src/components/GpaGoalPanel.tsx`（成绩录入卡下方，左栏第二张卡）；计算纯函数在 `app/src/services/gpaGoal.ts`。
- **解决的问题**：已知「已修 GPA × 已修学分」与「本学期待修课程学分」，求达到目标 GPA 需要的等级组合（要修多少门 A / A- / B+…）。数学上 `(S0 + Σpᵢcᵢ)/(C0+Σcᵢ) ≥ T` ⇔ 本学期需拿到 `Σpᵢcᵢ ≥ T·(C0+Σcᵢ) − S0`；`needed` 与 `4.0·Σcᵢ` 一比即可判定「可达 / 不可达 / 已达标」，并在不可达时给出全 A 上限 GPA。
- **三类输出**：① 结论数字（本学期需平均绩点、需拿到学分绩点、达标后 GPA、全 A 上限）；② **最低达标组合**（帕累托最小：任一门课再降一档就跌破目标，直接回答「最少要修到多少」）；③ **全部达标组合**（可展开，按新 GPA 升序，最多展示 60 条，并给出总数）。
- **组合口径**：等级 10 档（A+ 与 A 同为 4.0 合并为 A；EX/P/N 不参与）；同学分课程可互换，组合按等级多重集只计一次，展示时标注；最多 10 门课。
- **规模控制**（`gpaGoal.ts`）：后缀满分剪枝 + 「已达目标时改用组合数公式 C(n+k−1, n−1) 收口」避免逐个叶子展开；最低组合用「slack 必然小于最小单步降幅 0.3×最小单科学分」再剪一次；样本与最低组合分别设上限并标注截断。8 门 3 学分、低目标的压力场景实测约 15 ms。
- **持久化**：输入（目标 GPA、已修 GPA、已修学分、待修课程学分）随 `autumn-gpa-state` 的 `goal` 字段保存；数值字段以字符串存（承载「3.」等输入中间态），加载时白名单校验。首次进入且已有已录成绩时自动带入已修基线，另提供「按已录成绩带入」按钮（提示：若已录里含本学期课程需手动改小，避免重复计算）。
- **与排课表联动（待修课程一键导入）**：
  - 面板按钮「从排课表导入」→ 页面 `handleImportFromPlans`（`GpaPage.tsx`）→ 桥接纯函数 `services/planImport.ts` 的 `buildGoalCoursesFromPlan`。
  - **来源**：默认只导「参与排课」的卡片（`PlanState.cards` 中 `active`）；班级课表组（`classGroups`）为**可选**（面板勾选「同时导入班级课表组」，默认关）——整班课表常含 20+ 门，全量导入会顶到上限，故不默认导入。
  - **学分回查**：卡片只存课程编号/名称，学分需查通知单 → `services/courseLoader.ts` 的 `loadCourseRecords()` 惰性加载 1.9 MB 课程 JSON（模块级 Promise 缓存，仅点导入时才 fetch，不拖慢 `/gpa` 首屏）；匹配顺序「编号+名称 → 编号 → 名称」，都查不到则跳过并在提示里列出课程名。
  - **去重**：课程编号优先（无编号退化名称）；与目标清单已有课程判重；同一门课在卡片与班级组重复只计一次（班级组内同一编号的多个教学班也只算一门）。排除项按 `excludedPoolKeys` 生效。
  - **上限**：组合枚举最多 `MAX_GOAL_COURSES = 10` 门（`services/gpaGoal.ts` 导出），导入时按「10 − 已有门数」截断并提示「另有 N 门未导入，可分批计算」，避免直接落到「最多支持 10 门」的报错态。
  - **共享纯函数**：`services/courseData.ts` 新增 `coursePoolKey`（原站 getCourseKey 五元组）与 `courseMatchesClassText`（原站 courseMatchesClass），`hooks/usePlanPool.ts`、`hooks/useClassGroups.ts` 已改为复用，避免排课表与绩点页各写一份口径。
  - 导入的课程在清单里带「排课表」来源标记（`goal.courses[].code` 非空），仍可手动改学分或删除。
- **待修课程的四种填法（共用 `services/goalCourses.ts` 的 `mergeGoalCourses` 判重：课程编号优先、无编号按名称归一去重）**：
  1. 手动添加 / 批量粘贴（面板内）；
  2. 点「从排课表导入」读当前 PlanState 的参与排课卡片，可选叠加班级课表组（见上）；
  3. 点「导入课表 txt」——`services/timetableParse.ts` 解析排课表页「导出当前课表 (.txt)」的产物：以「【n】课程名」分块、块内识别「课程编号」「学分」；无分块标记时退化为逐行「课程名 … 学分」；同课程编号去重；缺学分/缺课名的块进 `skipped` 并在提示里报数；
  4. 在排课表页选定方案后点「导入到绩点规划 →」——`services/planHandoff.ts` 用 sessionStorage 做**一次性交接**（`autumn-plan-handoff`），`/gpa` 面板挂载时消费并立即清除，刷新或新标签页不会重复导入；交接数据带 `missing` 计数，提示哪些课程因通知单里查不到学分而未带入。

### 站外链接与外链风险提醒（全站）

- **两个组件**：
  - `app/src/components/ExternalLink.tsx`（+ `ExternalLink.css`）：站外链接的统一锚点组件——自动补 `target="_blank"` 与 `rel="noopener noreferrer nofollow"`，默认在文字后加「↗」标记（图标类外链传 `showIcon={false}`，仅包裹图片/多行内容时用）。组件本身**不做提醒**，只负责标记与加固；
  - `app/src/components/ExternalLinkGuard.tsx`（+ `ExternalLinkGuard.css`）：挂载于 `App.tsx` 顶层的**全局外链风险提醒**——在 document 捕获阶段拦截所有 `<a href>` 点击，目标与当前站点**不同 host**（即非同域名外链）时先 `preventDefault`，弹出 `role="alertdialog"` 提醒框（醒目展示目标域名与完整地址 + 三条风险提示），用户点「我已知晓，继续访问」后才按原锚点语义跳转（原 `target="_blank"` → `window.open`，否则整页跳转），点「取消，留在本站」/Esc/点遮罩则原地不动。
- **为什么用全局拦截而非逐个包组件**：外链散落在 React 页面与 legacy 挂载页（含 legacy HTML 里的普通 `<a>`），全局拦截一次覆盖，且同一链接不会弹两次框。**新增外链仍应使用 `ExternalLink`**（统一 rel/标记），地址常量登记在 `config.ts`。
- **豁免规则**：同 host 站内链接、`#hash`、`mailto:`/`tel:` 等协议、带 `download` 的下载链接不拦截；按住 Ctrl/Cmd/Shift/Alt 或中键点击时放行浏览器默认行为（用户明确要求新标签页，与站内 `LegacyLinkInterceptor` 约定一致）；锚点加 `data-external-ignore` 表示已知可信外链，跳过提醒（白名单口子）。
- **提醒强度**：默认每次点击都提醒；弹窗内勾选「本次会话不再提醒」后写 `sessionStorage` 键 `autumn-external-link-ack`，仅在当前标签页会话内静默放行，关闭标签页恢复提醒。
- 已接入的外链：排课表页「CAU选课助手」按钮（`config.ts` 的 `CAU_COURSE_ASSISTANT_URL`，顶栏 `.beta-ext-row`，旁有常驻提醒文案）、首页「机考模拟」（vm.cau.edu.cn）、首页页脚 GitHub / Apache 链接、首页广告弹窗（jwzs.cau.edu.cn）。

## 用户后端（Cloudflare Workers + D1，`backend/`）

为「多用户 + 跨设备」提供的账号与数据同步后端，**按 Cloudflare 托管做选型适配**：
Workers（边缘运行时）+ D1（Serverless SQLite）+ Web Crypto（无第三方加密库）+ Cron Triggers（定时清理）。
选择**零依赖**实现（自带 ~90 行 router，不用 Hono/itty-router），因此可以不装 wrangler、不联网就完成端到端自测。

### 后端结构（`backend/`）

- `src/index.ts`：Worker 入口——CORS 预检、路由分发、统一错误信封、`scheduled` 定时清理；路由表见 `src/routes/`（`meta.ts` 元信息 / `auth.ts` 认证 / `data.ts` 设置与方案 / `account.ts` 导出·改密·注销）。
- `src/http.ts`：JSON 信封 `{ok,...}` / `{ok:false,error:{code,message,details}}`、`ApiError`、CORS 白名单回显、请求体类型与体积校验、安全响应头。
- `src/crypto.ts`：`PBKDF2-HMAC-SHA256` 口令哈希（格式 `pbkdf2-sha256$<iter>$<salt>$<hash>`，可平滑升级迭代次数）、`AUTH_PEPPER` 胡椒（HMAC 预处理）、SHA-256、随机 token。
- `src/session.ts`：不透明会话 token（**D1 只存 SHA-256 摘要**）、滑动续期（剩余 < 1/3 时续，走 `ctx.waitUntil` 不阻塞响应）、HttpOnly Cookie 与 Bearer 双通道。
- `src/ratelimit.ts`：基于 D1 的限流（登录 10 次/15 分钟锁 15 分钟、注册 20 次/小时、改密删号 10 次/小时），触发返回 429 + `Retry-After`。
- `src/db.ts`：全部 SQL（参数化绑定；表名限定为 `user_settings` / `user_plans` 联合类型）；`revision` 乐观锁，`If-Match` 冲突返回 409 并回带服务端当前数据。
- `migrations/0001_init.sql`：`users` / `sessions` / `user_settings` / `user_plans` / `auth_attempts`；时间戳统一毫秒；用户名/邮箱存「原样 + 归一化小写」两列承载唯一约束。
- `scripts/`：`d1-shim.mjs`（用 Node 24 内置 `node:sqlite` 实现 D1 最小 API 子集）+ `smoke-test.mjs`（**72 项断言的端到端冒烟测试**）。
- 端点：`/api/health`、`/api/meta`、`/api`、`/api/auth/{register,login,logout,me}`、`/api/settings`、`/api/plans`（GET/PUT/DELETE）、`/api/account/export`、`/api/account/password`、`/api/account`（DELETE）。完整契约、错误码、部署检查清单见 `backend/README.md`。

### 前端接入（`app/src/`）

- **`services/api.ts`**：HTTP 客户端（`VITE_BACKEND_BASE_URL` 拼装、自动 Bearer、错误信封解析、401 自动清理登录态、超时/网络失败统一为 `status=0` 降级）。
- **`services/cloudProvider.ts`**：通用**「云端优先 + 本机镜像」**存储实现（settings / plans 共用）。未登录走匿名本地键；登录后读云端、写「先本机镜像再 PUT 云端」，云端不可用只告警不阻断；**本机镜像按 `<键>@u:<userId>` 分键**，同浏览器多账号互不串数据。
- **`auth/`**：`AuthContext.tsx`（登录态；挂载时用缓存资料先渲染再由 `/api/auth/me` 校正，仅 401 才登出）、`tokenStore.ts`（token/用户资料 + `getAuthSnapshot()`）、`api.ts`、`AccountPanel.tsx`（登录/注册表单 + 已登录管理：导出云端数据 / 注销账号 / 退出登录）、`AccountDialog.tsx`（首页导航栏弹窗）、`AccountPanel.css`。
- **挂载位置**：`App.tsx` 最外层为 `AuthContextProvider`（`Settings/PlansContextProvider` 依赖它）；账号入口 = 首页顶部导航「登录 / 注册」（登录后显示昵称+云端）与排课表页「用户设置」卡片内嵌面板（副标题随登录态在「云端同步已开启 / 本地自动保存」间切换）。
- **存储键**：`autumn-auth-token`、`autumn-auth-user`、`autumn-user-settings`(+\`@u:<id>\`)、`autumn-plan-state`(+\`@u:<id>\`)；匿名键与接入后端前同名，老数据可直接续用。
- **老用户首登迁移**：云端为空且匿名本地有数据时，自动把本地数据一次性 PUT 上云，不丢配置。
- **关闭云端**：`app/.env.local` 设 `VITE_BACKEND_ENABLED=false`（或干脆不填 `VITE_BACKEND_BASE_URL` 且后端未部署），即回到纯本地单机模式，完全不发 `/api` 请求。
- 数据流细节、契约示例、手测清单见 **`docs/user-backend.md`**。

### 本地开发与自测

```bash
# 后端（终端 A）
cd backend
cp .dev.vars.example .dev.vars      # 修改 AUTH_PEPPER / ALLOWED_ORIGINS
pnpm exec wrangler d1 migrations apply autumn-autools --local
pnpm run dev                        # http://127.0.0.1:8787

# 前端（终端 B）：app/vite.config.ts 已把 /api 代理到 127.0.0.1:8787，无需配置环境变量
cd app && pnpm run dev              # http://localhost:3000

# 自测（零依赖、可离线）
cd backend
node scripts/smoke-test.mjs                                   # 72 项断言
node ../app/node_modules/typescript/bin/tsc -p tsconfig.json  # 类型校验
```

> 冒烟测试直接 import 真实的 `src/index.ts`，用 `node:sqlite` 桩替代 D1，覆盖注册/登录/限流锁定/CORS/越权/乐观锁/多用户隔离/改密/删号/定时清理等；**D1 桩仅验证逻辑，并发与真实迁移工具链请以 `wrangler dev` + 远程 D1 为准**。

### 部署（简要）

```bash
cd backend
pnpm exec wrangler login
pnpm exec wrangler d1 create autumn-autools        # 把 database_id 填回 wrangler.toml
pnpm exec wrangler d1 migrations apply autumn-autools --remote
pnpm exec wrangler secret put AUTH_PEPPER
pnpm run deploy
```

前端跨域部署时在 `app/.env.local` 填 `VITE_BACKEND_BASE_URL`，并把静态站来源加入后端 `ALLOWED_ORIGINS`。
**免费额度适配要点**：PBKDF2 100000 次 ≈ 28 ms CPU，Workers 免费版单请求 CPU 上限约 10 ms，故免费版建议 `PBKDF2_ITERATIONS=25000`；付费版（30 s CPU）可保持 100000+。
安全要点：口令 PBKDF2 + 胡椒、会话只存摘要可吊销、用户名枚举时间对齐、D1 限流、CORS 白名单、请求体上限、响应绝不含 `password_hash`、用户可自助导出与注销（级联删除）。

## 构建与运行（原静态站点）

### 本地预览

由于前端使用 `fetch()` 加载 JSON，直接双击 `file://` 协议打开页面会导致跨域/安全限制。请通过本地 HTTP 服务器访问：

```bash
# 在项目根目录启动 Python 内置 HTTP 服务器
python -m http.server 8000
```

然后浏览器访问：

- 首页：`http://localhost:8000/index.html`
- 排课表工具：`http://localhost:8000/ca.html`
- 通知单课表预览（可直接访问，也可通过 `ca.html` 的悬浮窗打开）：`http://localhost:8000/cn.html`

其他等效的静态服务器（如 `npx serve`、`live-server`、`nginx`）均可。

### 更新课程数据

当拿到新的 Excel 通知单后，执行以下步骤：

1. 将 Excel 文件放入 `src/py/` 目录。
2. 运行转换脚本：

```bash
# 自动读取同目录下第一个 Excel 文件
python src/py/json-trans.py

# 或指定文件路径
python src/py/json-trans.py "src/py/附件3：2025-2026学年春学期通知单课表.xlsx"
```

3. 脚本会：
   - 读取第 3 行（A-S 列）作为表头；
   - 从第 4 行开始读取数据，直到某行首列为空；
   - 以 A2 单元格内容作为 JSON 文件名（自动清理非法字符并追加 `.json`）；
   - 在同目录下生成 JSON 文件。
4. 若 `ca.html` 中硬编码的 `COURSE_DATA_PATH` 与新文件名不一致，需同步修改该常量。

### 版本号管理

项目按功能模块拆分版本号，当前划分如下：

- **排课表工具**：`version-ca.json`，当前 `v1.2.2`，`ca.html` 右上角显示“排课表工具 v1.2.2”，`cn.html` 与 `CourseArrangement.js` 使用该版本号破坏课程数据缓存。
- **题库**：`version-qbn.json`，当前 `v1.0.0`，用于 `qbn.html` 题库模块资源。
- **C/C++ 在线编译器**：`version-cpp.json`，当前 `v1.0.0`，`cpp.html` 工具栏显示“C/C++ 在线编译器 vX.Y.Z”，`cpp.html` 用该版本号破坏题库 JSON（`data/cpp-problems.json`）与 `js/lib/JSCPP.es5.min.js` 的缓存。
- **全局框架**：`version-global.json`，当前 `v1.2.2`，用于 `GlobalStyle.css`、`index.js`、`FloatingWindow.js` 等公共资源，影响 `index.html`、`ca.html`、`cn.html`、`qbn.html`。

各模块对应的前端变量为 `APP_VERSION_CA`、`APP_VERSION_QBN`、`APP_VERSION_CPP`、`APP_VERSION_GLOBAL`。

发布新版本时按需运行：

```bash
# 排课表工具更新（含 ca.html、cn.html、CourseArrangement.js 课程数据缓存）
python scripts/bump-ca.py 1.2.3

# 题库更新
python scripts/bump-qbn.py 1.0.1

# C/C++ 在线编译器更新（含 cpp.html、题库 JSON 与 JSCPP 缓存）
python scripts/bump-cpp.py 1.0.1

# 全局框架更新（公共样式/悬浮球/悬浮窗等）
python scripts/bump-global.py 1.2.3
```

脚本会自动同步对应 `version-*.json`、`js/version-*.js` 以及相关 HTML 中模块资源的 `?v=` 参数。公共辅助逻辑在 `scripts/lib/version_bump.py` 中，新增模块时可直接复制脚本并修改模块名与文件集合。

部署时建议对 `index.html`、`ca.html`、`cn.html`、`qbn.html` 设置较短的缓存时间（或 `Cache-Control: no-cache`），以确保用户能拿到带新版本戳的 HTML。

### Python 环境准备

```bash
pip install openpyxl
# 如需兼容 .xls 旧格式，再安装
pip install xlrd
```

## 代码组织

### 前端

- **`index.html` / `ca.html` / `qbn.html`**：页面结构与页面级样式。`ca.html` 的搜索栏展开/收起、响应式布局等样式均内联在 `<style>` 中；`index.html` 与 `qbn.html` 使用 flex 纵向布局将页脚推至底部，右侧设有“快捷入口”圆角大白按钮区（`.dial-group` / `.dial-title` / `.dial-grid` / `.dial-btn`），并通过 `GlobalStyle.css` 提供的工具类统一配色。`index.html` 快捷入口下方另设有“趣味功能”选项卡区（`.fun-section` / `.fun-tabs` / `.fun-tab` / `.fun-panel`，含“今天吃什么”“窝囊费打表”“农大tips”三个选项卡，切换逻辑内联在页面 `<script>` 中，选中项带绿色发光阴影、切换时内容区上边缘有绿色光影滑动）。其中“窝囊费打表”面板内置日历组件（`.fee-cal-*`），读取 `data/fee-days.json`（`YYYY-MM-DD` 字符串数组）高亮指定日期，支持上/下月切换，JSON 读取失败时按无高亮渲染。
- **`cn.html`**：通知单课表预览页，使用 SheetJS 解析 `src/py/` 下的 `.xls/.xlsx` 通知单，再转换为 Univer Sheets 的 `IWorkbookData` 数据结构，通过 Univer 引擎渲染；支持 Excel 原生筛选（AutoFilter、按条件筛选、多列 AND 组合）、冻结表头、状态栏统计、列宽拖拽、工作表切换等。
- **`cpp.html`**：纯前端 C++ 在线编译器（刷题辅助），单文件内联样式与脚本。通过 CDN 引入 CodeMirror 5（cdnjs，直引脚本非 ESM，避免模块重复实例问题）；JSCPP 2.0.0 为本地文件 `js/lib/JSCPP.es5.min.js`（es5 全局构建，浏览器本地同步解释执行，死循环会卡页面；jsDelivr 在国内不稳定故本地化，`execCode` 内有未加载的友好提示）。题目、判题用例从 `data/cpp-problems.json` 读取（数组，字段：`id` / `title` / `description` / `starterCode` / `cases[{input, expected}]`），前台只读展示题目描述与样例，提交后逐用例校核（忽略行尾空白与末尾空行差异）并显示 Accepted / Wrong Answer；JSON 加载失败时回退到内置默认题目。本地运行为独立 stdin 窗口 + 终端输出，点运行一次性批量执行（JSCPP 的 stdin 为一次性模型：`stdio.drain` 仅在 cin/scanf 初始化时调用一次）。代码、主题、选中题目存 `localStorage`（键前缀 `cpp-`）。
- **`css/GlobalStyle.css`**：提取了公共渐变类 `.ca-gradient-surface`、悬浮球组件（含三横线 → X 图标动画：上/下横条为 `#floatingBall::before/::after`，中横条为球内 `span.fb-bar`，由 `is-expanded` 类驱动纯 CSS transition 正反向播放，参数为 `:root` 下的 `--fb-*` 变量）、可拖拽悬浮窗组件、`#SidebarButtonArea`、可堆叠圆角大按钮组件（`.dial-group`、`.dial-title`、`.dial-grid`、`.dial-btn`）以及通用工具类（`.primary-bg`、`.primary-text`、`.primary-border`、`.surface-card`、`.text-white`、`.text-center`、`.hover-primary` 等）跨页面复用样式。
- **`js/index.js`**：
  - 负责悬浮球初始化位置、指针拖拽、边缘吸附、hover 伸出；
  - 负责点击悬浮球/遮罩/外部区域时展开/收起侧边栏；
  - 使用 `requestAnimationFrame` 避免布局抖动。
- **`js/FloatingWindow.js`**：
  - 提供全局 `createFloatingWindow(src, options)` API；
  - 悬浮窗支持标题栏拖拽、四角/四边缩放、关闭按钮、点击置顶；
  - 拖拽/缩放期间通过 `pointer-events: none` 暂停 iframe 事件拦截，保证操作连贯。
- **`js/CourseArrangement.js`**：
  - 通过 `fetch` 加载 `COURSE_DATA_PATH` 指向的 JSON，并附带 `APP_VERSION_CA`（兼容旧 `APP_VERSION`）作为缓存破坏参数；
  - 提供课程、教师、时间三类输入建议；
  - 支持自助方案排课：课程卡片池、班级课表组、校区偏好、阻塞时段、方案生成与切换；
  - 使用 `localStorage`（键 `ca-state`）持久化排课进度、方案卡片、班级组、校区偏好与阻塞时段，页面加载完成后自动恢复；
  - 选中的课程对象会暴露到 `window.selectedCourseRecord` 与 `window.selectedCourseKeyValuePairs`，供后续功能扩展使用。
- **`ca.html` 侧边栏按钮区**：在 `#CandidatePool` 上方新增 `#SidebarButtonArea`，目前放置“通知单课表”按钮，用于在悬浮窗中打开 `cn.html`；后续可在此区域集中管理扩展按钮。

### 数据脚本

- **`src/py/json-trans.py`**：
  - 支持 Open XML（`.xlsx` 等）与 OLE（`.xls`）两种 Excel 格式探测；
  - 提供文件名安全化（`sanitize_filename`），避免 Windows 保留名与非法字符；
  - 命令行参数可选，未传参时自动查找脚本同目录下第一个 Excel。

## 开发约定

- **语言**：注释、UI 文案、脚本输出均使用中文。新增功能请保持中文注释与提示文本。
- **DOM 操作**：使用原生 DOM API（`getElementById`、`addEventListener` 等），不引入 jQuery。
- **CSS**：
  - 页面特定样式可内联在对应 HTML 的 `<style>` 中；
  - 跨页面复用的样式（如渐变背景）请放入 `css/GlobalStyle.css`；
  - 使用 CSS 自定义属性（`--joint-color`、`--topbar-seam-light` 等）维护主题色。
- **JavaScript**：
  - 使用 `const` / `let`，避免 `var`；
  - 事件处理注意 `pointer` 事件与 `click` 去抖（参考 `index.js` 中的 `suppressClick` 模式）；
  - 动画使用 `requestAnimationFrame` 与 `transform`/`opacity` 以利用合成层。
- **Python**：
  - 使用类型注解（`list[dict[str, object]]` 等）；
  - 使用 `pathlib.Path` 处理路径；
  - 错误信息输出到 `sys.stderr` 并返回非零退出码。

## 测试说明

- **唯一自动化测试：用户后端冒烟测试**（`backend/scripts/smoke-test.mjs`，72 项断言，零依赖、可离线）：
  用 Node 24 内置 `node:sqlite` 桩替代 D1，直接调用真实的 `worker.fetch` / `worker.scheduled`，
  覆盖注册/登录/限流锁定/CORS/越权/乐观锁/多用户隔离/改密/注销/定时清理等。改动后端后**必须**运行：

  ```bash
  cd backend
  node scripts/smoke-test.mjs                                   # 期望：✅ 全部通过：72 项断言
  node ../app/node_modules/typescript/bin/tsc -p tsconfig.json  # 类型校验（无 wrangler 时可用 app 内的 tsc）
  ```

- **前端仅有类型校验**（`cd app && pnpm run build` 的第一段 `tsc -b`）；项目**没有前端单元测试/端到端测试**。
- 如需验证改动，请按“构建与运行”章节启动本地服务器，并手动在浏览器中测试：
  - 首页悬浮球拖拽、边缘吸附、点击展开侧边栏；
  - 排课表页三个搜索框的输入建议、选中课程后预览标签的更新；
  - `cn.html` 通知单课表页：表头是否显示筛选下拉按钮、多列筛选后行数是否正确、状态栏是否随选区变化；
  - `ca.html` 排课表页：添加方案卡片/班级课表并刷新后状态是否恢复、点击“校区偏好”按钮是否在“无/东校区/西校区”之间循环切换并重新生成方案、时间段偏好编辑模式下课表边框是否闪烁且 hover 为手型光标；
  - **账号与云端同步**（`app/` 版）：未登录时排课表操作不发 `/api` 请求；首页「登录 / 注册」注册后提示云端同步已开启；改偏好/加课程能在 Network 中看到 `PUT /api/settings`、`PUT /api/plans` 返回 200；换浏览器登录同账号能看到同一份数据；退出后回到匿名本机数据（不串号）；停掉后端时页面不报错且仍可操作（控制台有降级告警）；设 `VITE_BACKEND_ENABLED=false` 构建后账号面板显示纯本地模式；
  - 外链提醒：点排课表页「CAU选课助手」或首页「机考模拟」等非同域名外链应先弹风险提醒——「取消」不跳转、「我已知晓，继续访问」才按原语义（新窗口/整页）打开，勾选「本次会话不再提醒」后本次会话内不应再弹窗；点站内链接与带 `download` 的下载链接不应弹窗；
  - 绩点计算页（`/gpa`）：逐门添加与「批量粘贴导入」都能入表（粘贴示例见输入框 placeholder），通识课 / EX / P / N 行自动置灰且不参与计算，双击「重修口径」两个按钮时总 GPA 与必修 GPA 立即按规则变化，刷新后成绩与口径都恢复，导出 `.txt` 的明细与页面一致，首页「绩点计算」大按钮与各页导航都能进入该页；
  - 目标 GPA 规划（同一页）：有已录成绩时自动带入已修基线；改目标 GPA / 增删待修课程后结论即时刷新；「最低达标组合」里任一组合再降一档就会跌破目标；「展开全部组合」显示的总数与列表一致；目标高于全 A 上限时给出「不可达 + 上限 GPA」；刷新后目标、基线与待修课程都保留；
  - 排课表联动（同一页）：排课表里有参与排课的卡片时，「从排课表导入」可一键带入（课程名 + 学分，行尾带「排课表」标记），再次点击只报「跳过 N 门已在清单里的课程」；勾选「同时导入班级课表组」后导入会包含整班课程并在超过 10 门时提示「另有 N 门未导入」；没有排课表数据时按钮禁用并给出跳转 `/ca` 的提示；
  - 课表 txt / 方案一键带入：在排课表生成方案后点「导入到绩点规划 →」应跳到 `/gpa` 且待修课程里出现该方案课程（带「排课表」标记、状态提示「已从排课表方案导入 N 门课程」），刷新后不重复导入；在绩点页点「导入课表 txt」选择排课表导出的 txt，应识别课程名/编号/学分，重复课程被跳过、缺学分的块报数；
  - 浏览器控制台是否有 `fetch` 或 JS 报错。

## 部署说明

### 前端（静态资源）

- `app/` 构建产物 `app/dist/` 为纯静态资源，可直接部署到任意静态托管服务（Cloudflare Pages、GitHub Pages、Vercel、Netlify、Nginx、Apache 等）。
- **注意**：`index.html` 中的导航链接使用绝对路径 `/index.html` 与 `/ca.html`，部署时应确保站点位于域名根路径，或根据实际路径修改这些链接。
- 课程数据 JSON 体积较大（约 1.9 MB），部署时建议：
  - 开启 gzip/brotli 压缩；
  - 若数据更新不频繁，可设置较长的缓存头；
  - 后续如数据量进一步增大，可考虑按需分页或索引化，但目前前端为全量加载。

### 用户后端（Cloudflare Workers + D1）

- 部署步骤、环境变量、检查清单见 **`backend/README.md`**（`wrangler d1 create` → `migrations apply --remote` → `secret put AUTH_PEPPER` → `deploy`）。
- 跨域部署时：前端 `app/.env.local` 填 `VITE_BACKEND_BASE_URL`（Worker 地址，不含 `/api`），并把静态站来源加入后端 `ALLOWED_ORIGINS`（`http://localhost:3000` 与 `http://127.0.0.1:3000` 是不同来源）。
- 若前端与 Worker 同域（推荐，Cloudflare Pages + Workers 自定义域），前端无需任何环境变量，Cookie 通道也可用。
- **免费额度**：Workers 免费版单请求 CPU 上限约 10 ms，而 PBKDF2 100000 次 ≈ 28 ms，故免费版请把 `PBKDF2_ITERATIONS` 降到 `25000`；升级 Workers Paid 后可保持 100000+。
- 不部署后端也能正常运行：前端会静默降级为纯本地单机模式（也可显式设 `VITE_BACKEND_ENABLED=false`）。

## 安全注意事项

- 前端从相对路径 `fetch` JSON，应确保该 JSON 文件可被公开访问且不被注入恶意内容。
- Python 脚本生成的 JSON 文件名来自 Excel 的 A2 单元格，脚本已做文件名安全化，但仍建议不要在不受信任的 Excel 文件上直接运行。
- **站外链接**：全站非同域名外链点击时由 `ExternalLinkGuard` 弹出风险提醒，确认后才跳转（见「站外链接与外链风险提醒」）；外链统一使用 `ExternalLink` 渲染，自动带 `rel="noopener noreferrer nofollow"`，防止第三方页面通过 `window.opener` 反向控制本站。
- **用户后端**（`backend/`，详见 `backend/README.md` §8）：口令 `PBKDF2-HMAC-SHA256` + 可选 `AUTH_PEPPER` 胡椒；会话 token 仅以 SHA-256 摘要入库、支持吊销；登录失败次数限流并做等时响应防用户名枚举；CORS 仅回显白名单来源；请求体强制 JSON 并限体积；DB 全部参数化绑定；响应绝不含 `password_hash`；账号可自助导出与注销（级联删除）。
- **前端凭据存储**：token 存于 `localStorage`（跨域部署时唯一可靠通道）。本项目不渲染用户输入的 HTML、页面无第三方脚本注入点，风险可控；若日后引入富文本/UGC，应改为同域部署 + HttpOnly Cookie 模式（后端已支持，前端只需删除 token 逻辑）。
- **管理端注意**：`AUTH_PEPPER` 一旦更换，所有既有口令都将无法校验；`ALLOW_REGISTRATION=false` 可关闭公开注册（私有部署推荐）。

## 已知待办/扩展点

- `ca.html` 的 `:root` 注释中留有 `TODO：后续可在此替换两栏渐变主色`。
- `index.html` 的 `#News` 与 `#OtherLink` 区域目前为空，可后续填充内容。
- `CourseArrangement.js` 将选中的课程暴露到 `window`，为后续“生成课表”“导出 ICS”等功能预留了接口。
- 用户后端：`PlanState.savedPlans` 与 `user_plans.revision` 已预留多方案/乐观锁能力，前端暂未启用冲突提示（`If-Match`）；`AUTH_PEPPER` 轮换需先实现「双 pepper 校验 + 登录重算」；账号注销后本机镜像键暂未自动清理；限流目前基于 D1 表，QPS 上升后可换 Rate Limiting 绑定或 Durable Object。
- 课程数据仍在浏览器全量加载（约 1.9 MB），后续可把检索下沉到 Worker（`/api/courses?keyword=`）配合 D1 索引或 R2。
- 绩点计算：**电子成绩单 PDF 文件导入尚未接入**——农大电子成绩单是加密 + 数字签名的 PDF，且表头/分页版式会变，需拿到一份真实样本（脱敏亦可）后按文本坐标实现并校准；当前替代方案是把成绩单文字复制后「批量粘贴导入」（`services/transcriptParse.ts` 已能解析成绩单表格行）。成绩与绩点目前只存本机 `localStorage`，未接用户后端云端同步（`hooks/useGpaState.ts` 的单向数据流已便于替换为 §用户设置接口层 那套 Provider）。
