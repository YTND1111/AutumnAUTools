import type { AppConfig } from "./config.ts";
import type { Env } from "./types.ts";

/** 统一错误对象：抛出后由 index.ts 的兜底逻辑转成 JSON 响应 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  /** 附加响应头（如 429 的 Retry-After） */
  readonly headers: Record<string, string> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/** 统一响应信封：{ ok: true, ...payload } / { ok: false, error: {...} } */
export function jsonResponse(payload: Record<string, unknown>, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ ok: status < 400, ...payload }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...securityHeaders(),
      ...(headers ?? {}),
    },
  });
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...(headers ?? {}) } });
}

/** 把任意异常转成 JSON 错误响应（未知异常统一 500，避免泄露内部信息） */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return jsonResponse(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      err.status,
      err.headers,
    );
  }
  console.error("[error] 未处理的异常", err);
  return jsonResponse({ error: { code: "internal_error", message: "服务器内部错误，请稍后重试。" } }, 500);
}

function securityHeaders(): Record<string, string> {
  return {
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  };
}

/**
 * CORS 响应头。
 * - 仅当请求来源在 ALLOWED_ORIGINS 白名单内（或配置为 "*"）时回显 ACAO，
 *   未授权来源不返回该头，浏览器会自行拦截；
 * - 跨域需要携带 Cookie 时浏览器禁止 ACAO=*，因此始终回显具体来源 + Vary: Origin；
 * - 前端默认用 Authorization: Bearer 访问，Cookie 只是同源场景的兜底。
 */
export function corsHeaders(request: Request, cfg: AppConfig): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = cfg.allowAllOrigins || cfg.allowedOrigins.includes(origin);
  if (!allowed) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,If-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function applyHeaders(response: Response, extra: Record<string, string>): Response {
  if (Object.keys(extra).length === 0) return response;
  const next = new Response(response.body, response);
  Object.entries(extra).forEach(([key, value]) => next.headers.set(key, value));
  return next;
}

/** 客户端 IP（Cloudflare 注入 CF-Connecting-IP；本地开发可能缺失） */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Real-IP") ?? "unknown";
}

/**
 * 读取并校验 JSON 请求体：
 * - 必须声明 application/json（防止简单的跨站表单伪造）；
 * - Content-Length / 实际字节数双重限制，超限返回 413（防止超大 JSON 打爆 D1）；
 * - JSON 解析失败返回 400。
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "请求体必须是 application/json。");
  }

  const declared = Number.parseInt(request.headers.get("Content-Length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "payload_too_large", `请求体过大（上限 ${Math.floor(maxBytes / 1024)}KB）。`);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new ApiError(413, "payload_too_large", `请求体过大（上限 ${Math.floor(maxBytes / 1024)}KB）。`);
  }
  if (text.trim().length === 0) {
    throw new ApiError(400, "empty_body", "请求体为空。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "请求体不是合法 JSON。");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(400, "invalid_body", "请求体必须是 JSON 对象。");
  }
  return parsed as Record<string, unknown>;
}

/** 从请求中取当前站点来源（用于日志与 CORS 诊断） */
export function requestOrigin(request: Request, env: Env): string {
  return request.headers.get("Origin") ?? `${env.ENVIRONMENT ?? "local"}://${new URL(request.url).host}`;
}
