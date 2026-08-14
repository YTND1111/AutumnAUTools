# AGENTS.md — AutumnAUTools（秋功）

> 本文件面向 AI 编程助手，用于快速了解项目结构、技术栈、构建方式与开发约定。项目注释和文档以中文为主，因此本文件使用中文撰写。

## 项目概述

AutumnAUTools（中文名“秋功”）是一个面向中国农业大学课程通知单的静态 Web 查询工具。它包含：

- 一个首页（`index.html`），提供可拖拽的悬浮球与侧边栏导航；
- 一个排课表工具页（`ca.html`），支持按课程、授课教师、上课时间进行检索，自助方案排课与班级课表调用状态会持久化到 `localStorage`，刷新后自动恢复；
- 一个通知单课表预览页（`cn.html`），使用 Univer Sheets 嵌入电子表格引擎，以接近 Excel 的体验浏览并筛选原始通知单；
- 一个可复用的 iframe 悬浮窗组件（`js/FloatingWindow.js`），支持拖拽、关闭、边框缩放；
- 一个 Python 辅助脚本（`src/py/json-trans.py`），用于将 Excel 格式的课程通知单转换为前端读取的 JSON；
- 转换后的课程数据（`src/py/中国农业大学2025-2026学年春季学期通知单课表.json`）作为静态资源被前端 `fetch` 加载。

本项目无后端服务、无构建流水线、无框架依赖，属于纯静态站点。

## 技术栈

- **前端**：HTML5、原生 CSS3、原生 ES6+ JavaScript。
  - 不使用 React/Vue/Angular 等前端框架编写业务代码。
  - `cn.html` 通过 CDN 引入 Univer Sheets（内部基于 React）与 SheetJS，实现专业表格预览与筛选。
  - 不使用 npm/yarn/pnpm 等包管理器，也没有 `package.json`。
- **数据脚本**：Python 3。
  - 依赖：`openpyxl`（读取 `.xlsx` 等现代 Excel 格式）。
  - 可选依赖：`xlrd`（仅在读取旧版 `.xls` 二进制格式时需要）。
- **数据格式**：Excel（源数据）→ JSON（前端消费）。

## 目录结构

> **归档说明（2026-08）**：原纯静态旧版站点已全部归档至 `legacy/`（页面、样式、脚本、数据与版本号工具原样保留，目录内部相对引用不变）；React 应用位于 `app/`，是当前唯一开发主线。根目录仅保留文档与许可证。**下文中 `index.html`、`ca.html`、`scripts/`、`src/py/` 等相对路径均相对于 `legacy/` 解读**（描述旧版实现），明确标注 `app/` 的除外。

```
AutumnAUTools/
├── app/                    # React 应用（Vite + React 19 + TS，当前开发主线，详见下文「React 迁移」）
│   ├── index.html          # Vite 入口 HTML（挂载 #root）
│   ├── src/                # React 源码（pages/ components/ hooks/ services/ settings/ plans/ legacy/）
│   ├── public/             # 静态资源副本（css/js/data/src/py/questionBank/cn.html/legacy/*.html）
│   └── package.json        # dev / build / preview 脚本
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

- **路由外壳**：`app/src/App.tsx` 使用 HashRouter（`/` 首页、`/ca` 排课表、`/qbn` 题库、`/cn` 整页跳转静态 `cn.html`），并以**捕获阶段**全局点击拦截把遗留 HTML 中的 `/index.html`、`/ca.html`、`/qbn.html`（含笔误 `/qn.html`）绝对链接映射为路由跳转（侧边栏在冒泡阶段有 `stopPropagation`，故必须捕获阶段）。
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

- **`app/src/hooks/useFloatingBall.ts`**：`js/index.js` 悬浮球逻辑（拖拽/吸附/侧边栏/rAF 合帧）的忠实 Hook 移植。`getElementById` 改为 ref 注入；全部事件监听在卸载时精确移除（消除了原脚本 SPA 切换后监听残留的问题）；暴露 `closeSidebar()` 供导航后主动收起侧边栏。
- **`app/src/components/FloatingChrome.tsx`**：悬浮球 + 遮罩 + 侧边栏共享框架组件。class/id 保持原样（样式仍由 `GlobalStyle.css` 提供）；侧边栏链接用 `<Link>` 并通过 props 传入；清理了原 HTML 的无效 `<scan>` 标签与重复 `id="Tool"`（链接块统一用 `.nav-cell` 类，`app/public/css/GlobalStyle.css` 中已与原 `#Navigater, #Tool, #News` 选择器并列声明，遗留页面不受影响）。
- **`app/src/components/FunTabs.tsx`**：首页趣味功能选项卡。绿色光影滑动 + 阴影生长动画原样保留（光影位移直接操作 DOM style 不进状态，激活/阴影态由 useState 驱动），快速连点的定时器结算逻辑一致。
- **`app/src/components/FeeCalendar.tsx`**：窝囊费打表日历。年月状态由 useState 驱动（替代手动 innerHTML 重绘），`data/fee-days.json` 高亮日期在 useEffect 内 fetch 一次，失败按无高亮渲染（同原逻辑）。
- **`app/src/pages/QbnPage.tsx` / `HomePage.tsx` + 同名 scoped CSS**：页面内容原生 JSX。内联 `<style>` 移植为 `.qbn-page` / `.home-page` 作用域 CSS（避免通用类名污染）；站内链接改用 `<Link>`；`href="#"` 占位按钮改为 `<button>`（HashRouter 下 `#` 会误触路由）；答题页仍为独立静态页整页打开；不再加载页面用不到的 version 常量脚本。首页的 `:root` 变量与 GlobalStyle 完全一致（冗余，已省略）；三个独立 `.news-list` 包装合并为数据驱动的单列表（CSS gap 归零保持原间距）。

后续重写排课表页时遵循同一模式：页面内容 → `pages/XxxPage.tsx` + 作用域 CSS，公共框架复用 `FloatingChrome`，业务脚本按 `useFloatingBall` 的方式逐步 Hook 化（排课表页的 `CourseArrangement.js` 约 2400 行，建议按「课程搜索 / 候选池 / 方案生成 / 课表渲染」分模块拆解，而非一次性移植）。

### 版本号与公告（React 版）

React 迁移后，旧站 `version-*.json` + bump 脚本的版本管理体系**不再适用于 `app/`**（旧体系已随旧站归档至 `legacy/`）。新约定：

- **版本号单一事实来源：`app/src/config.ts`**。`APP_VERSION_HOME`（首页/全局，展示于首页页脚「秋功 vX.Y.Z」）、`APP_VERSION_CA`（排课表工具，展示于排课表页顶栏右上角「排课表工具 vX.Y.Z」，位置/样式对齐原站 `#VersionLabel`）。发版时改这两个常量即可，随构建生效。
- **业务代码无需手动版本戳**：Vite 产物自带内容指纹（`assets/index-<hash>.js|css`），缓存破坏免费获得。
- **课程数据缓存戳**：`COURSE_DATA_VERSION` 派生自 `APP_VERSION_CA`（fetch 课程 JSON 时以 `?v=` 附加），排课表发版即自动刷新课程数据缓存，无需单独维护。
- **首页公告**：`config.ts` 的 `ANNOUNCEMENTS` 数组（`{date, title, content}`），仅在首页顶栏下方渲染公告条（`.announcement-bar`），空数组则不渲染；新公告加在数组开头。首页「最新更新」列表（`HomePage.tsx` 的 `NEWS_ITEMS`）发版时手动同步一条。

### 用户设置接口层（后端就绪）

为后续接入后端准备，设置读写统一走 **`app/src/settings/`** 的 Provider 抽象：

- **`types.ts`**：`UserSettings`（当前含 `scheduleMode`、`campusPreference`）与 `DEFAULT_SETTINGS`。
- **`provider.ts`**：`SettingsProvider` 异步接口（`load` / `save`）。当前实现为 `LocalStorageSettingsProvider`（键 `autumn-user-settings`）；**接入后端时仅需实现 `RemoteSettingsProvider`（骨架已在文件注释中给出）并替换 `settingsProvider` 实例化那一行**，业务代码零改动。
- **`SettingsContext.tsx`**：`SettingsContextProvider`（已挂载在 `App.tsx` 的 Routes 外层）+ `useSettings()` Hook；挂载时异步加载并与默认值合并，更新时乐观写入内存并防抖 300ms 持久化。

### 排课表原生重构（已上线，正式路由 `/ca`）

- **`/ca` 现由原生重构版（`app/src/pages/CaBetaPage.tsx`）提供服务**，plan / class 双模式功能与原站对齐；`/ca-beta` 重定向到 `/ca`；原遗留挂载退至 `/ca-legacy`（无入口，仅回滚兜底，稳定后可连同 `app/src/legacy/` 与 `app/public/legacy/` 一起删除）。组件/样式名中的 `beta` 为历史命名，内部使用无妨。
- **页面布局对齐原站双栏**：`.beta-main` 为 `minmax(0,1fr) 380px` 网格（对应原站 `#Layout`）——左栏 `.beta-schedule` 放课表网格（`tt-grid` 保持 `min-width: 828px`，过宽时左栏横向滚动，同原站 `#ScheduleSection`），右栏 `.beta-sidebar` 纵向堆叠候选卡片池/班级组池、用户设置卡片、方案生成面板（对应原站 `#Sidebar`）；视口 <1100px 时回退单栏（原站无此行为，为窄屏易用性增强）。
- 已完成：**搜索模块**——`app/src/components/SearchBar.tsx` 通用搜索建议组件（课程/班级检索共用，忠实还原原交互：50 条上限、加载中/无匹配提示、点击外部收起、清除按钮）；数据层 `app/src/services/courseData.ts`（纯检索函数，忠实移植 `normalize`/`splitClasses`/`findCourseCandidates`/`findClassTimetableCandidates`）+ `app/src/hooks/useCourseData.ts`（JSON 加载，版本戳常量在 `app/src/config.ts`，需与 `version-ca.json` 同步）。
- `CaBetaPage.tsx` 同时是**设置接口的演示页**：排课模式切换与校区偏好循环均经 `useSettings()` 持久化，刷新后保留。
- 已完成：**候选课程卡片池**——`app/src/components/CourseCardPool.tsx` + `app/src/hooks/usePlanPool.ts`。卡片 = 课程（编号+名称），教学班列表（options）不持久化、恢复时从课程数据水合重建（无匹配自动丢弃，对应原站学期切换后旧卡片失效）；参与排课开关与教师/校区/时间段/班级四个筛选维度忠实对齐原站 `togglePlanFilter` 语义（**某维度 enabled 集合为空 = 全部放行**）；展开区额外提供教学班列表（置灰 = 被筛选过滤，原站无此列表，为易用性增强）。
- 方案状态走 **`app/src/plans/` 的 PlanProvider 抽象**（与 settings 层同构）：`types.ts`（`PlanState` 含 `ownerId` 字段预留用户隔离维度，当前恒为 `null`；`selectedWeek` 为课表周次定位；`blockedCells/blockedDays/blockedPeriods` 阻塞时段；`planClassGroups/classModeGroups` 班级组）、`provider.ts`（`LocalStoragePlanProvider`，键 `autumn-plan-state`；`RemotePlanProvider` 骨架在注释中，接入后端时替换实例化那一行即可）、`PlansContext.tsx`（`PlansContextProvider` 已挂载于 `App.tsx` + `usePlans()`，乐观更新 + 防抖 300ms 持久化）。**多用户配课方案的后端接入点即在此层**。
- 已完成：**课表网格**——`app/src/services/scheduleParse.ts`（时间/周次解析、区间合并、冲突检测、冲突文案，全部忠实移植 `js/CourseArrangement.js` 同名函数；小节 1-12 → 大节 0-5 映射）、`app/src/hooks/useTimetable.ts` + `app/src/components/TimetableGrid.tsx`。6 大节 × 7 天网格、周次定位 chips（经 PlanProvider 持久化）、格子内多课程按最早开课周排序虚线分隔、冲突块红色高亮 + 网格下方冲突文案汇总（与原站 `formatConflictMessage` 一致）。网格显示源对齐原站 `getActiveCoursesForDisplay`：plan 模式 = 激活方案 + 激活班级课程组（未生成时走过渡预览：每张卡片一个教学班、点击块循环切换，会话态）；class 模式 = 激活班级组 − 排除项。
- 已完成：**方案生成**——`app/src/services/planGenerator.ts`（纯函数：四维筛选 + 校区偏好 + 阻塞时段候选过滤 → 回溯枚举，pairwise 全学期冲突检测，无冲突/冲突方案各至多 20 套，忠实移植 `generatePlans()`；班级课程组固定占用 `fixedCourses` 已接入）、`app/src/hooks/usePlanGenerator.ts`（生成结果会话态——原站亦不持久化；`activePlanId` 经 PlanProvider 持久化；校区偏好变化自动重新生成，与原站 `cycleCampusPreference` 一致）、`app/src/components/PlanGeneratorPanel.tsx`（工具栏：校区偏好循环/时间段偏好开关/重置偏好/生成方案 + 方案 pills 切换）。校区偏好**复用设置层** `settings.campusPreference`（不再单设状态）；阻塞时段由网格偏好编辑模式维护（编辑态点击格子/行头/列头切换阻塞，闪烁动画 + 红色阻塞标记，与原站 `planPrefEditMode` 一致）。
- 已完成：**班级课表组**——`app/src/hooks/useClassGroups.ts` + `app/src/components/ClassGroupSection.tsx`（双模式共用）。组课程列表不持久化、按班级名从课程数据重建（`courseMatchesClass` 忠实移植，poolKey 去重，学期切换后无匹配自动丢弃）；class 模式：检索选中即整班激活、单门排除/恢复（自动激活整组）、全选/一键清除、组冲突红色标记；plan 模式：课程组作为固定占用参与网格显示与方案生成避让；「复制到方案排课」把激活组连同排除状态深复制到 plan 组并切换到 plan 模式（结果提示横幅模拟原站 toast）。与原站的差异：plan 组卡片冲突仅组内计算（方案课程冲突已由网格高亮覆盖）。

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

- 当前项目**没有单元测试、集成测试或端到端测试**。
- 如需验证改动，请按“构建与运行”章节启动本地服务器，并手动在浏览器中测试：
  - 首页悬浮球拖拽、边缘吸附、点击展开侧边栏；
  - 排课表页三个搜索框的输入建议、选中课程后预览标签的更新；
  - `cn.html` 通知单课表页：表头是否显示筛选下拉按钮、多列筛选后行数是否正确、状态栏是否随选区变化；
  - `ca.html` 排课表页：添加方案卡片/班级课表并刷新后状态是否恢复、点击“校区偏好”按钮是否在“无/东校区/西校区”之间循环切换并重新生成方案、时间段偏好编辑模式下课表边框是否闪烁且 hover 为手型光标；
  - 浏览器控制台是否有 `fetch` 或 JS 报错。

## 部署说明

- 本项目为纯静态站点，可直接部署到任意静态托管服务（GitHub Pages、Vercel、Netlify、Nginx、Apache 等）。
- **注意**：`index.html` 中的导航链接使用绝对路径 `/index.html` 与 `/ca.html`，部署时应确保站点位于域名根路径，或根据实际路径修改这些链接。
- 课程数据 JSON 体积较大（约 1.9 MB），部署时建议：
  - 开启 gzip/brotli 压缩；
  - 若数据更新不频繁，可设置较长的缓存头；
  - 后续如数据量进一步增大，可考虑按需分页或索引化，但目前前端为全量加载。

## 安全注意事项

- 前端从相对路径 `fetch` JSON，应确保该 JSON 文件可被公开访问且不被注入恶意内容。
- Python 脚本生成的 JSON 文件名来自 Excel 的 A2 单元格，脚本已做文件名安全化，但仍建议不要在不受信任的 Excel 文件上直接运行。
- 项目无认证、无授权、无敏感数据处理逻辑，部署时无需额外鉴权配置。

## 已知待办/扩展点

- `ca.html` 的 `:root` 注释中留有 `TODO：后续可在此替换两栏渐变主色`。
- `index.html` 的 `#News` 与 `#OtherLink` 区域目前为空，可后续填充内容。
- `CourseArrangement.js` 将选中的课程暴露到 `window`，为后续“生成课表”“导出 ICS”等功能预留了接口。
