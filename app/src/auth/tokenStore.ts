import type { AuthUser } from "./types";

/**
 * 登录凭据的本地存储。
 *
 * 为什么用 localStorage 存 token（而不是只靠 HttpOnly Cookie）：
 *   本站是纯静态站点，通常与 Worker 不同域名；跨站 Cookie 受浏览器第三方
 *   Cookie 策略影响（Safari/Chrome 正在逐步禁用），Bearer token 才是可靠通道。
 *   Cookie 通道仍被后端支持（同域部署时更安全），前端两者可并存。
 *
 * 安全提示：localStorage 中的 token 可被同源 XSS 读取。本项目不渲染任何用户
 * 输入的 HTML，页面无第三方脚本注入点，风险可控；如日后引入富文本/UGC，
 * 建议改为同域部署 + HttpOnly Cookie 模式（后端已支持，前端只需删除 token 逻辑）。
 */

const TOKEN_KEY = "autumn-auth-token";
const USER_KEY = "autumn-auth-user";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return safeGet(TOKEN_KEY);
}

/** 缓存的用户资料（用于刷新后立即渲染登录态，随后由 /api/auth/me 校正） */
export function getCachedUser(): AuthUser | null {
  const raw = safeGet(USER_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as AuthUser).id === "string") {
      return parsed as AuthUser;
    }
    return null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn("[账号] 无法写入本地登录态。", err);
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

/**
 * 供存储提供者（settings / plans）读取的登录快照：
 * token 与用户 id 缺一不可，否则按「未登录」走本机匿名数据。
 */
export function getAuthSnapshot(): { token: string | null; userId: string | null } {
  const token = getToken();
  const user = getCachedUser();
  return { token, userId: token && user ? user.id : null };
}
