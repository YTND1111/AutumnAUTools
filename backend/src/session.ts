import type { AppConfig } from "./config.ts";
import { createSessionToken, sha256Hex } from "./crypto.ts";
import { findUserById } from "./db.ts";
import type { D1Database, ExecutionContext, Env, SessionRow, UserRow } from "./types.ts";

/** 会话 Cookie 名（跨域场景由前端改用 Authorization: Bearer，见 README） */
export const SESSION_COOKIE = "autumn_session";

/** 从 Authorization: Bearer 或 Cookie 中取出原始 token */
export function readTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]) return match[1].trim();
  }
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === SESSION_COOKIE && rest.length > 0) {
        return decodeURIComponent(rest.join("="));
      }
    }
  }
  return null;
}

/** 创建会话：只把 token 的 SHA-256 存入 D1，明文仅返回给客户端 */
export async function createSession(
  db: D1Database,
  cfg: AppConfig,
  userId: string,
  request: Request,
  now: number,
): Promise<{ token: string; expiresAt: number }> {
  const token = createSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = now + cfg.sessionTtlMs;

  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      tokenHash,
      userId,
      now,
      expiresAt,
      now,
      (request.headers.get("User-Agent") ?? "").slice(0, 200) || null,
      request.headers.get("CF-Connecting-IP") ?? null,
    )
    .run();

  return { token, expiresAt };
}

export interface ResolvedSession {
  user: UserRow;
  session: SessionRow;
}

/**
 * 校验会话：
 * - token 缺失或已过期（或用户已被删除）→ 返回 null；
 * - 剩余有效期不足 1/3 时自动续期（滑动过期），续写走 ctx.waitUntil 不阻塞响应。
 */
export async function resolveSession(
  env: Env,
  cfg: AppConfig,
  request: Request,
  ctx?: ExecutionContext,
  now = Date.now(),
): Promise<ResolvedSession | null> {
  const token = readTokenFromRequest(request);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const session = await env.DB.prepare("SELECT * FROM sessions WHERE token_hash = ?").bind(tokenHash).first<SessionRow>();
  if (!session) return null;

  if (session.expires_at <= now) {
    // 过期会话顺手清理（waitUntil 不阻塞响应）
    const cleanup = env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    if (ctx) ctx.waitUntil(cleanup);
    else await cleanup;
    return null;
  }

  const user = await findUserById(env.DB, session.user_id);
  if (!user) {
    const cleanup = env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    if (ctx) ctx.waitUntil(cleanup);
    else await cleanup;
    return null;
  }

  const remaining = session.expires_at - now;
  if (remaining < cfg.sessionTtlMs / 3) {
    const nextExpires = now + cfg.sessionTtlMs;
    const renew = env.DB.prepare("UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?")
      .bind(nextExpires, now, tokenHash)
      .run();
    if (ctx) ctx.waitUntil(renew);
    else await renew;
    session.expires_at = nextExpires;
    session.last_seen_at = now;
  } else {
    const touch = env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
    if (ctx) ctx.waitUntil(touch);
    else await touch;
  }

  return { user, session };
}

/** 注销当前会话（幂等） */
export async function destroySession(env: Env, request: Request): Promise<void> {
  const token = readTokenFromRequest(request);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

/** 清理某用户的全部会话（改密/删号后强制下线） */
export async function destroyAllSessions(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

/** 生成 Set-Cookie（同源部署时的兜底登录态；跨域请用 Bearer） */
export function buildSessionCookie(token: string, cfg: AppConfig): string {
  const maxAge = Math.floor(cfg.sessionTtlMs / 1000);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (cfg.secureCookies) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(cfg: AppConfig): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (cfg.secureCookies) parts.push("Secure");
  return parts.join("; ");
}
