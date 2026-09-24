/**
 * DeepSeek 的纯前端 BYOK（Bring Your Own Key）请求层。
 *
 * 不保存、不上传 API Key；调用由浏览器直接发往用户填写的兼容接口。
 * 只依赖浏览器 Fetch API，避免为一个轻量对话工具引入额外 SDK。
 */

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekStreamOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: DeepSeekMessage[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

/** 将用户填写的根地址、/v1 地址或完整端点统一为 chat completions 地址。 */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("请填写 API 地址。");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { error?: { message?: unknown } | unknown; message?: unknown };
  if (value.error && typeof value.error === "object" && "message" in value.error) {
    const message = (value.error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof value.error === "string" && value.error.trim()) return value.error;
  if (typeof value.message === "string" && value.message.trim()) return value.message;
  return null;
}

async function responseError(response: Response): Promise<Error> {
  const raw = await response.text().catch(() => "");
  let message: string | null = null;
  try {
    message = readErrorMessage(JSON.parse(raw));
  } catch {
    message = raw.trim() || null;
  }
  return new Error(message ? `接口请求失败（${response.status}）：${message}` : `接口请求失败（${response.status}）。`);
}

function emitDelta(payload: unknown, onDelta: (text: string) => void) {
  if (!payload || typeof payload !== "object") return;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length || !choices[0] || typeof choices[0] !== "object") return;
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return;
  const content = (delta as { content?: unknown }).content;
  if (typeof content === "string" && content) onDelta(content);
}

/** 发送流式对话请求，并逐段交给页面渲染。 */
export async function streamDeepSeekChat({
  baseUrl,
  apiKey,
  model,
  messages,
  signal,
  onDelta,
}: DeepSeekStreamOptions): Promise<void> {
  if (!apiKey.trim()) throw new Error("请填写 API Key。");
  if (!model.trim()) throw new Error("请填写模型名称。");

  const response = await fetch(buildChatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({ model: model.trim(), messages, stream: true }),
    signal,
  });
  if (!response.ok) throw await responseError(response);
  if (!response.body) throw new Error("接口没有返回可读取的流，请检查服务是否支持 stream。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consumeLine = (line: string) => {
    const data = line.trim();
    if (!data.startsWith("data:")) return;
    const payload = data.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      emitDelta(JSON.parse(payload), onDelta);
    } catch {
      // 忽略不完整或非 JSON 的 SSE 行，下一段继续解析。
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(consumeLine);
      if (done) break;
    }
    if (buffer) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

/** 用一条极短请求检查用户配置，只有用户主动点击时才会产生调用。 */
export async function testDeepSeekConnection(options: Omit<DeepSeekStreamOptions, "messages" | "onDelta">): Promise<void> {
  const response = await fetch(buildChatCompletionsUrl(options.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: options.model.trim(),
      messages: [{ role: "user", content: "请只回复：连接成功" }],
      stream: false,
      max_tokens: 8,
    }),
    signal: options.signal,
  });
  if (!response.ok) throw await responseError(response);
}
