# AGENTS.md — AutumnAUTools（秋功）

> 本文件面向 AI 编程助手，用于快速了解项目结构、技术栈、构建方式与开发约定。项目注释和文档以中文为主，因此本文件使用中文撰写。

## 项目概述

AutumnAUTools（中文名“秋功”）是一个面向中国农业大学课程通知单的静态 Web 查询工具。它包含：

- 一个首页（`index.html`），提供可拖拽的悬浮球与侧边栏导航；
- 一个排课表工具页（`ca.html`），支持按课程、授课教师、上课时间进行检索；
- 一个 Python 辅助脚本（`src/py/json-trans.py`），用于将 Excel 格式的课程通知单转换为前端读取的 JSON；
- 转换后的课程数据（`src/py/中国农业大学2025-2026学年春季学期通知单课表.json`）作为静态资源被前端 `fetch` 加载。

本项目无后端服务、无构建流水线、无框架依赖，属于纯静态站点。

## 技术栈

- **前端**：HTML5、原生 CSS3、原生 ES6+ JavaScript。
  - 不使用 React/Vue/Angular 等框架。
  - 不使用 npm/yarn/pnpm 等包管理器，也没有 `package.json`。
- **数据脚本**：Python 3。
  - 依赖：`openpyxl`（读取 `.xlsx` 等现代 Excel 格式）。
  - 可选依赖：`xlrd`（仅在读取旧版 `.xls` 二进制格式时需要）。
- **数据格式**：Excel（源数据）→ JSON（前端消费）。

## 目录结构

```
AutumnAUTools/
├── index.html              # 首页：悬浮球 + 侧边栏导航
├── ca.html                 # 排课表工具页：三个搜索框 + 建议列表
├── css/
│   └── GlobalStyle.css     # 全局复用样式（当前仅 ca-gradient-surface）
├── js/
│   ├── index.js            # 首页悬浮球拖拽、吸附、侧边栏开关逻辑
│   └── CourseArrangement.js # 课程数据加载与检索建议逻辑
├── src/
│   └── py/
│       ├── json-trans.py   # Excel → JSON 转换脚本
│       ├── 中国农业大学2025-2026学年春季学期通知单课表.json   # 转换后的课程数据
│       └── 附件3：2025-2026学年春学期通知单课表.xlsx           # 原始 Excel 数据源
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

### Python 环境准备

```bash
pip install openpyxl
# 如需兼容 .xls 旧格式，再安装
pip install xlrd
```

## 代码组织

### 前端

- **`index.html` / `ca.html`**：页面结构与页面级样式。`ca.html` 的搜索栏展开/收起、响应式布局等样式均内联在 `<style>` 中。
- **`css/GlobalStyle.css`**：提取了公共渐变类 `.ca-gradient-surface`，供顶栏、侧边栏复用。
- **`js/index.js`**：
  - 负责悬浮球初始化位置、指针拖拽、边缘吸附、hover 伸出；
  - 负责点击悬浮球/遮罩/外部区域时展开/收起侧边栏；
  - 使用 `requestAnimationFrame` 避免布局抖动。
- **`js/CourseArrangement.js`**：
  - 通过 `fetch` 加载 `COURSE_DATA_PATH` 指向的 JSON；
  - 提供课程、教师、时间三类输入建议；
  - 去重逻辑以“课程名称”或“教师|课程”/“时间|课程”为键；
  - 选中的课程对象会暴露到 `window.selectedCourseRecord` 与 `window.selectedCourseKeyValuePairs`，供后续功能扩展使用。

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
