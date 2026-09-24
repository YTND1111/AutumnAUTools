# 秋功开发日志

## 2026-09-24 · DeepSeek BYOK 纯前端对话

> 当前状态：该功能已暂时从应用入口和路由中禁用，相关源码保留，待完成安全改造后再恢复。

- 新增 `/deepseek` 页面，支持用户填写 DeepSeek API 地址、API Key 和模型名称。
- 浏览器直接请求 OpenAI 兼容的 `/chat/completions` 接口，支持流式输出、停止生成、清空对话和连接测试。
- API Key 默认只保存在当前浏览器会话；用户主动勾选“在本机记住 Key”后才写入浏览器本地存储。项目不会把 Key 上传到秋功服务器，也不会写入日志。
- 首选地址为 `https://api.deepseek.com`，首选模型为 `deepseek-chat`；地址和模型仍可按用户的兼容服务自行修改。
- 当前阶段不引入后端、AI Agent 框架或第三方聊天 SDK，保留后续增加代理层和工具调用的空间。

### 本次使用的开源工具与来源

| 工具 | 用途 | 许可证 / 说明 |
| --- | --- | --- |
| React 19 | 页面与状态管理 | MIT，项目既有依赖 |
| React Router 7 | `/deepseek` 路由和站内导航 | MIT，项目既有依赖 |
| Vite 7 | 前端开发与构建 | MIT，项目既有依赖 |
| 浏览器 Fetch API / ReadableStream | 直连接口和解析 SSE 流 | 浏览器原生 Web API，不新增第三方依赖 |
| DeepSeek API | 用户自备模型服务 | 外部 API 服务，不属于本项目打包的开源依赖；调用费用由用户账户承担 |

本次没有复制或嵌入 LibreChat、Open WebUI、LobeChat 等完整聊天项目，也没有引入 Vercel AI SDK 或 assistant-ui；后续若采用这些项目，需要在日志中补充具体版本和许可证核对结果。
