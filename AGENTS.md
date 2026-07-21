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

```
AutumnAUTools/
├── index.html              # 首页：悬浮球 + 侧边栏导航
├── ca.html                 # 排课表工具页：三个搜索框 + 建议列表 + 悬浮窗入口
├── cn.html                 # 通知单课表预览页：Excel 方式浏览原始课程通知单
├── qbn.html                # 题库首页：右侧可堆叠分类按钮区
├── cpp.html                # C++ 在线编译器页：JSCPP 本地解释执行 + CodeMirror 5 编辑器 + 预设用例判题
├── css/
│   └── GlobalStyle.css     # 全局复用样式（渐变背景、悬浮球、悬浮窗、侧边栏按钮区）
├── js/
│   ├── index.js            # 首页悬浮球拖拽、吸附、侧边栏开关逻辑
│   ├── CourseArrangement.js # 课程数据加载与检索建议逻辑
│   ├── FloatingWindow.js   # 可拖拽、可关闭、可缩放的 iframe 悬浮窗
│   ├── version-ca.js       # 排课表工具版本号 APP_VERSION_CA
│   ├── version-qbn.js      # 题库版本号 APP_VERSION_QBN
│   ├── version-cpp.js      # C/C++ 在线编译器版本号 APP_VERSION_CPP
│   ├── version-global.js   # 全局框架版本号 APP_VERSION_GLOBAL
│   └── lib/
│       └── JSCPP.es5.min.js # C++ 解释器（本地化，供 cpp.html 使用）
├── scripts/
│   ├── bump-ca.py          # 管理排课表工具版本号
│   ├── bump-qbn.py         # 管理题库版本号
│   ├── bump-cpp.py         # 管理 C/C++ 在线编译器版本号
│   ├── bump-global.py      # 管理全局框架版本号
│   └── lib/version_bump.py # 版本号管理公共辅助函数
├── src/
│   └── py/
│       ├── json-trans.py   # Excel → JSON 转换脚本
│       ├── 中国农业大学2025-2026学年春季学期通知单课表.json   # 转换后的课程数据
│       └── 附件3：2025-2026学年春学期通知单课表.xlsx           # 原始 Excel 数据源
├── version-ca.json         # 排课表工具版本号
├── version-qbn.json        # 题库版本号
├── version-cpp.json        # C/C++ 在线编译器版本号
├── version-global.json     # 全局框架版本号
├── LICENSE                 # Apache-2.0 许可证全文
├── README.md               # 项目简介（内容极简）
└── prd.md                  # 产品需求草稿（仅三段标题）
```

## 构建与运行

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
- **`css/GlobalStyle.css`**：提取了公共渐变类 `.ca-gradient-surface`、悬浮球组件、可拖拽悬浮窗组件、`#SidebarButtonArea`、可堆叠圆角大按钮组件（`.dial-group`、`.dial-title`、`.dial-grid`、`.dial-btn`）以及通用工具类（`.primary-bg`、`.primary-text`、`.primary-border`、`.surface-card`、`.text-white`、`.text-center`、`.hover-primary` 等）跨页面复用样式。
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
