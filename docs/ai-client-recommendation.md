# 自带 API Key 的安全 AI 对话客户端选型（BYOK 名册）

> 目的：为「用户自备 API Key、密钥只存本机、请求直连模型厂商官方端点」的使用场景，挑选**开源、可审计、活跃维护**的 AI 对话工具。
>
> **数据核对日期：2026-10-03**，来源为 GitHub REST API（`https://api.github.com/repos/<owner>/<repo>`）的实时快照，字段为 `license.spdx_id` / `stargazers_count` / `pushed_at`。
> 本文**只核实了许可证标识与活跃度**；**未**审阅各项目 LICENSE 全文，**未**做独立安全审计。涉及法律用途前请以仓库内 `LICENSE` 原文为准。

---

## 1. 快速结论

- **普通用户（Windows 桌面，要中文界面、开箱即用）**：装 **Cherry Studio**，从官方 GitHub Releases 下载，在「设置 → 模型服务」填入自己的 Key 即可。
- **想要极简 / 手机端**：**Chatbox**。
- **想完全离线（不用任何 API Key）**：**Jan**（或 Ollama + 任意 GUI）。
- **想在浏览器里访问 / 局域网或团队共用**：**LibreChat**（MIT，许可证最干净）或 **Open WebUI**（生态最大，但许可证含品牌条款、注意遥测）。
- **铁律**：客户端开源干净，也抵不过一个来路不明的**第三方中转端点**。端点必须是模型厂商官方地址。

---

## 2. 名册

| 工具 | 形态 | 许可证（API 标识） | 平台 | 星标 | 最近推送 | 适用场景 |
|---|---|---|---|---|---|---|
| **[Cherry Studio](https://github.com/CherryHQ/cherry-studio)** | 桌面应用 | `AGPL-3.0` | Win / mac / Linux | 52.3k | 2026-10-03 | **首选**：中文完善、供应商内置极多、支持自定义 OpenAI 兼容端点、本地存储无需账号 |
| **[Chatbox](https://github.com/chatboxai/chatbox)** | 桌面 + 移动 | `GPL-3.0` | Win / mac / Linux / iOS / Android | 41.9k | 2026-09-24 | 轻量极简、配置步骤最少 |
| **[Jan](https://github.com/janhq/jan)** | 桌面（Rust/Tauri） | 自定义（`NOASSERTION`） | Win / mac / Linux | 44.8k | 2026-10-02 | 100% 离线、本地模型、可完全不联网 |
| **[Open WebUI](https://github.com/open-webui/open-webui)** | 自托管网页（Docker/Python） | 自定义（`NOASSERTION`，BSD-3 系 + 品牌条款） | 浏览器 | 153.9k | 2026-10-03 | 生态最大、功能最全、多人共用 |
| **[LibreChat](https://github.com/LibreChat-AI/LibreChat)** | 自托管网页 | `MIT` | 浏览器 | 45.2k | 2026-10-03 | **许可证最干净**、多用户认证、团队自建 |
| **[AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)** | 桌面 + 自托管 | `MIT` | Win / mac / Linux / Docker | 66.7k | 2026-10-03 | 需要文档知识库 / RAG |
| **[LobeHub（原 LobeChat）](https://github.com/lobehub/lobehub)** | 自托管网页 + 桌面 | 自定义（`NOASSERTION`，Apache-2.0 系 + 附加条款） | 浏览器 / 桌面 | 83.0k | 2026-10-03 | 助手市场、插件生态 |
| **[NextChat](https://github.com/ChatGPTNextWeb/NextChat)** | 自托管网页 + 桌面 | `MIT` | 浏览器 / 桌面 | 88.8k | 2026-08-11 | ⚠️ 官方仓库现主推自家付费云（"No API key needed — sign up"），BYOK 自持路线已非其重心 |

### 关键判据：是否支持「自定义 OpenAI 兼容 Base URL」

这一条决定了工具能否接上**国产模型官方端点**（DeepSeek、智谱 GLM、Moonshot Kimi、阿里百炼、硅基流动等）与**本地推理服务**（Ollama、vLLM、LM Studio）。
上表中 Cherry Studio、Chatbox、Jan、Open WebUI、LibreChat、LobeHub、AnythingLLM 均支持；选型时应以**官方文档**为准确认当前版本行为。

### 关于 `NOASSERTION`（非标准许可证）

Jan、Open WebUI、LobeHub 三项的 GitHub 许可证标识为 `NOASSERTION`，表示其 `LICENSE` **不是 GitHub 能自动识别的标准 OSI 许可证**（通常是「标准许可证 + 附加条款」，例如品牌/商标限制、商业使用限制）。
- 个人自用：无实质影响。
- 二次分发、闭源集成、商业产品内嵌：**必须阅读 `LICENSE` 原文**，不可假设等同 MIT/Apache-2.0。

---

## 3. 安全评估标准（本名册的筛选依据）

一个 BYOK 客户端要「安全」，需同时满足：

1. **密钥本地化**：密钥存在本机（应用数据目录 / 浏览器 localStorage），不经由工具方服务器转发。
2. **请求直连官方端点**：客户端 → 模型厂商，中间没有工具方的代理层。
3. **开源可审计**：源码公开，可自行编译；许可证允许你审计与自建。
4. **活跃维护**：近期仍有提交（本次以 `pushed_at` 判断），安全修复能跟得上。
5. **无强制账号 / 无强制云同步**：不注册也能用，数据不被默认上传。

---

## 4. 安全戒律（比选客户端更重要）

客户端的干净程度，只占风险的一小部分。以下才是主要风险面：

1. **端点风险（最大）**
   绝不要使用「公益站 / 一键镜像 / 便宜中转 API」作为 Base URL。此类服务位于你与模型厂商之间，**能看到你的全部对话内容与密钥**，可记录、可转卖、可注入。请一律使用模型厂商**官方端点**。

2. **下载渠道风险（供应链）**
   - 只从项目**官方 GitHub Releases** 或其官网下载；核对校验和 / 签名。
   - 拒绝「绿色版 / 汉化破解版 / 二次打包版」——这是植入后门最常见的载体。
   - 警惕 npm / PyPI 上的**同名抢注仿冒包**（检索中即出现被安全标记为 ⚠️ 的 `aegis-desktop`、`astral-web-ui`、`chatbox-cckr`、`vyrii` 等）。**不要**从包管理器搜索页直接安装，务必核对 owner 与仓库主页。

3. **密钥卫生**
   - 每个工具单独签发 Key，不要一 Key 多用。
   - 在厂商控制台设置**消费上限 / 额度告警**，并确认可随时吊销。
   - 定期在厂商控制台检查用量异常。

4. **本地密钥的物理暴露**
   - 桌面端密钥存于应用数据目录；若该目录被同步进网盘 / 云盘，**等于把密钥上传**。同步时排除该目录。
   - 浏览器版（localStorage）密钥对**同源下的任何脚本**可见：页面一旦被 XSS 注入，密钥即刻泄露。

5. **自托管的公网暴露**
   Open WebUI / LibreChat / LobeHub 若直接暴露公网且未启用认证，等于把 Key 与对话历史送给全世界。应仅监听 `127.0.0.1`，或经内网 / 隧道 + 强制认证访问。

6. **数据本身的风险（客户端无法解决）**
   客户端安全 ≠ 数据安全：对话内容仍会送达你所选的模型厂商。**学号、身份证号、密码、他人隐私等敏感信息不要输入**。
   - 有关遥测：Open WebUI 提供匿名遥测相关配置项（如 `ENABLE_TELEMETRY` / `ANONYMOUS_TELEMETRY` 一类），**是否默认开启、如何彻底关闭，请以该版本官方文档为准自行核实**。

---

## 5. 接入 AutumnAUTools（纯静态站）的三种方式

本项目（`app/`，Vite + React，无后端）若要做「站内 AI 对话框」，按风险递增：

| 方案 | 做法 | 风险 |
|---|---|---|
| **A. 外链 / iframe 本地自托管 Chat（最稳）** | 本机跑 Open WebUI 或装 Cherry Studio，站点只放入口链接 | 密钥完全不过站点，最安全 |
| **B. 原生 BYOK 页面（可行）** | 新增 `/chat` 路由，用户自填供应商 / Base URL / 模型 / Key，Key 存 `localStorage`，前端直连官方端点 | 受 **CORS** 限制（部分厂商需特殊请求头）；**任何 XSS 都会泄露 Key**；须严格约束外部注入内容 |
| **C. 把 Key 打进构建产物（禁忌）** | 在 `app/` 内硬编码 Key 或经构建注入 | 等于公开发布密钥，**绝不可为** |

若采用方案 B，建议：
- 明确提示「密钥仅保存在本机浏览器」，并提供「清除密钥」按钮；
- 不改动既有 `settings/`、`plans/` 抽象层，新增独立的 BYOK 存储模块；
- 对渲染模型输出的部分做转义 / 白名单（避免模型输出触发的注入）。

---

## 6. 如何自行复核本名册

以下命令可直接拉取任一项目的最新事实（需联网，PowerShell）：

```powershell
$repo = 'CherryHQ/cherry-studio'
Invoke-RestMethod "https://api.github.com/repos/$repo" |
  Select-Object full_name, stargazers_count, pushed_at,
                @{ n = 'license'; e = { $_.license.spdx_id } },
                @{ n = 'archived'; e = { $_.archived } }
```

逐项核对时关注：
- `license.spdx_id` 是否为标准许可证（`NOASSERTION` 需读原文）；
- `pushed_at` 是否在近数月内（维护活跃度）；
- `archived` 是否为 `true`（已停止维护）；
- Release 页是否提供校验和 / 签名。

---

## 7. 附录：未纳入名册的类型

- **商业闭源客户端**：无法审计密钥流向，本名册不收录（不构成对其安全性的判定，仅因「可审计」标准不满足）。
- **网页版在线 AI 服务**：密钥或账号由服务方托管，不符合 BYOK 自持模型。
- **旧站归档中的历史工具**：与 `legacy/` 无关，本文档不影响既有静态站点结构。
