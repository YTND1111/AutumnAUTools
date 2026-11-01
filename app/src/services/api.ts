import { BACKEND_BASE_URL, BACKEND_ENABLED } from "../config";
import { clearSession, getToken } from "../auth/tokenStore";

/**
 * 用户后端 HTTP 客户端。
 *
 * - 统一拼装 BASE_URL（默认同源 /api，跨域部署时由 VITE_BACKEND_BASE_URL 指定）；
 * - 自动附带 `Authorization: Bearer <token>`（也可依赖 credentials:"include" 的 Cookie）；
 * - 统一把后端 { ok:false, error:{code,message} } 信封转成 ApiError；
 * - 401 时自动清理本地登录态（token 过期 / 账号已删除）；
 * - 网络失败与超时统一为 ApiError(status=0)，调用方据此回退本机数据。
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BACKEND_BASE_URL}${normalized}`;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** 是否附带登录凭据（登录/注册/元信息接口传 false） */
  auth?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") return undefined;
  return AbortSignal.timeout(ms);
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!BACKEND_ENABLED) {
    throw new ApiError(0, "backend_disabled", "未启用云端后端。");
  }

  const { method = "GET", body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutSignal(timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new ApiError(0, "timeout", "云端请求超时，已回退到本机数据。");
    }
    throw new ApiError(0, "network_error", "无法连接云端服务，已回退到本机数据。");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    if (response.status === 401) {
      // 会话失效：清掉本地凭据，界面自动回到未登录态
      clearSession();
    }
    throw new ApiError(
      response.status,
      error?.code ?? "http_error",
      error?.message ?? `云端请求失败（HTTP ${response.status}）。`,
      error?.details,
    );
  }

  return payload as T;
}
