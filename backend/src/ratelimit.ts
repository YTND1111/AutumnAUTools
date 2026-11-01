import type { AuthAttemptRow, D1Database } from "./types.ts";

/**
 * 基于 D1 的轻量限流（防口令爆破 / 批量注册）。
 *
 * 计数行形式：key = "<场景>:<ip>[:<用户名>]"，带时间窗口与锁定时间。
 * 说明：这是「够用就好」的实现——单表自增计数，读一次写一次；
 * 若日后 QPS 上去，可换成 Cloudflare Rate Limiting 绑定或 Durable Object。
 */

export interface RateLimitPolicy {
  /** 统计窗口（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大次数，达到即锁定 */
  max: number;
  /** 锁定时间（毫秒） */
  lockMs: number;
}

/** 登录：同一 IP + 用户名，15 分钟内最多 10 次失败，锁 15 分钟 */
export const LOGIN_POLICY: RateLimitPolicy = { windowMs: 15 * 60 * 1000, max: 10, lockMs: 15 * 60 * 1000 };

/** 注册：同一 IP，1 小时内最多 20 次，锁 1 小时 */
export const REGISTER_POLICY: RateLimitPolicy = { windowMs: 60 * 60 * 1000, max: 20, lockMs: 60 * 60 * 1000 };

/** 改密 / 删号：同一 IP + 用户，1 小时内最多 10 次，锁 30 分钟 */
export const SENSITIVE_POLICY: RateLimitPolicy = { windowMs: 60 * 60 * 1000, max: 10, lockMs: 30 * 60 * 1000 };

export interface RateLimitState {
  allowed: boolean;
  retryAfterSec: number;
}

export async function checkRateLimit(
  db: D1Database,
  key: string,
  policy: RateLimitPolicy,
  now: number,
): Promise<RateLimitState> {
  const row = await db.prepare("SELECT * FROM auth_attempts WHERE key = ?").bind(key).first<AuthAttemptRow>();
  if (!row) return { allowed: true, retryAfterSec: 0 };

  if (row.locked_until !== null && row.locked_until > now) {
    return { allowed: false, retryAfterSec: Math.ceil((row.locked_until - now) / 1000) };
  }
  if (now - row.window_start > policy.windowMs) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (row.count >= policy.max) {
    return { allowed: false, retryAfterSec: Math.ceil((row.window_start + policy.windowMs - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** 记一次尝试（失败或需要计入配额的请求）；达到上限即写入锁定时间 */
export async function recordAttempt(
  db: D1Database,
  key: string,
  policy: RateLimitPolicy,
  now: number,
): Promise<void> {
  const row = await db.prepare("SELECT * FROM auth_attempts WHERE key = ?").bind(key).first<AuthAttemptRow>();

  if (!row || now - row.window_start > policy.windowMs) {
    await db
      .prepare(
        `INSERT INTO auth_attempts (key, count, window_start, locked_until) VALUES (?, 1, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start, locked_until = NULL`,
      )
      .bind(key, now)
      .run();
    return;
  }

  const count = row.count + 1;
  const lockedUntil = count >= policy.max ? now + policy.lockMs : null;
  await db
    .prepare("UPDATE auth_attempts SET count = ?, locked_until = ? WHERE key = ?")
    .bind(count, lockedUntil, key)
    .run();
}

/** 成功后清空计数（登录成功即解锁） */
export async function clearAttempts(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM auth_attempts WHERE key = ?").bind(key).run();
}

/** 生成 429 响应所需的响应头 */
export function retryAfterHeaders(retryAfterSec: number): Record<string, string> {
  return { "Retry-After": String(Math.max(1, retryAfterSec)) };
}
