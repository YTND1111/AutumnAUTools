import type { AppConfig } from "../config.ts";
import { createUserId, hashPassword, verifyPassword } from "../crypto.ts";
import {
  findUserByEmailLower,
  findUserByUsernameLower,
  insertUser,
  toPublicUser,
  touchLastLogin,
  updatePasswordHash,
} from "../db.ts";
import { requireUser } from "../guard.ts";
import { ApiError, clientIp, jsonResponse, noContent, readJsonBody } from "../http.ts";
import {
  LOGIN_POLICY,
  REGISTER_POLICY,
  checkRateLimit,
  clearAttempts,
  recordAttempt,
  retryAfterHeaders,
} from "../ratelimit.ts";
import type { Route } from "../router.ts";
import { buildClearCookie, buildSessionCookie, createSession, destroySession } from "../session.ts";
import { assertPassword, normalizeDisplayName, normalizeEmail, normalizeUsername } from "../validate.ts";

/**
 * 认证端点：
 *   POST /api/auth/register   注册（成功即登录，返回 token）
 *   POST /api/auth/login      登录
 *   POST /api/auth/logout     注销（幂等）
 *   GET  /api/auth/me         当前用户
 *
 * token 同时以两种方式返回/下发：
 *   * 响应体 token 字段 —— 前端存 localStorage 并用 Authorization: Bearer 发送，
 *     适用于「静态站点与 API 不同域」的跨域部署；
 *   * Set-Cookie（HttpOnly）—— 同域部署时的兜底，脚本无法读取，更抗 XSS。
 */

/** 用户不存在时也执行一次等价的 PBKDF2，避免通过响应时间枚举用户名 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(cfg: AppConfig): Promise<string> {
  dummyHashPromise ??= hashPassword("autumn-autools-dummy-password", cfg.pepper, cfg.pbkdf2Iterations);
  return dummyHashPromise;
}

export const authRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/api/auth/register",
    handler: async (c) => {
      const now = Date.now();
      const ip = clientIp(c.request);

      if (!c.cfg.allowRegistration) {
        throw new ApiError(403, "registration_disabled", "本站已关闭注册，请联系管理员。");
      }

      const limitKey = `register:${ip}`;
      const limit = await checkRateLimit(c.env.DB, limitKey, REGISTER_POLICY, now);
      if (!limit.allowed) {
        throw new ApiError(
          429,
          "rate_limited",
          "注册过于频繁，请稍后再试。",
          { retryAfterSec: limit.retryAfterSec },
          retryAfterHeaders(limit.retryAfterSec),
        );
      }

      const body = await readJsonBody(c.request, c.cfg.maxPayloadBytes);
      const { raw, lower } = normalizeUsername(body.username);
      const password = assertPassword(body.password);
      const email = normalizeEmail(body.email);
      const displayName = normalizeDisplayName(body.displayName) ?? raw;

      try {
        if (await findUserByUsernameLower(c.env.DB, lower)) {
          throw new ApiError(409, "username_taken", "该用户名已被注册，请换一个。", { field: "username" });
        }
        if (email && (await findUserByEmailLower(c.env.DB, email.toLowerCase()))) {
          throw new ApiError(409, "email_taken", "该邮箱已被使用。", { field: "email" });
        }

        const userId = createUserId();
        const passwordHash = await hashPassword(password, c.cfg.pepper, c.cfg.pbkdf2Iterations);
        await insertUser(c.env.DB, {
          id: userId,
          username: raw,
          usernameLower: lower,
          displayName,
          email,
          emailLower: email ? email.toLowerCase() : null,
          passwordHash,
          now,
        });

        const user = await findUserByUsernameLower(c.env.DB, lower);
        if (!user) throw new ApiError(500, "internal_error", "注册失败，请稍后重试。");

        const { token, expiresAt } = await createSession(c.env.DB, c.cfg, user.id, c.request, now);

        // 成功注册也计入配额（防批量注册）
        await recordAttempt(c.env.DB, limitKey, REGISTER_POLICY, now);

        return jsonResponse(
          { user: toPublicUser(user), token, expiresAt },
          201,
          { "Set-Cookie": buildSessionCookie(token, c.cfg) },
        );
      } catch (err) {
        await recordAttempt(c.env.DB, limitKey, REGISTER_POLICY, now);
        throw err;
      }
    },
  },
  {
    method: "POST",
    pattern: "/api/auth/login",
    handler: async (c) => {
      const now = Date.now();
      const ip = clientIp(c.request);
      const body = await readJsonBody(c.request, c.cfg.maxPayloadBytes);
      const { lower } = normalizeUsername(body.username);
      const password = typeof body.password === "string" ? body.password : "";

      const limitKey = `login:${ip}:${lower}`;
      const limit = await checkRateLimit(c.env.DB, limitKey, LOGIN_POLICY, now);
      if (!limit.allowed) {
        throw new ApiError(
          429,
          "rate_limited",
          "尝试次数过多，账号已临时锁定，请稍后再试。",
          { retryAfterSec: limit.retryAfterSec },
          retryAfterHeaders(limit.retryAfterSec),
        );
      }

      const user = await findUserByUsernameLower(c.env.DB, lower);
      if (!user) {
        // 与真实校验等价的耗时，避免时间侧信道枚举用户名
        await verifyPassword(password, await getDummyHash(c.cfg), c.cfg.pepper, c.cfg.pbkdf2Iterations);
        await recordAttempt(c.env.DB, limitKey, LOGIN_POLICY, now);
        throw new ApiError(401, "invalid_credentials", "用户名或密码不正确。");
      }

      const { ok, needsRehash } = await verifyPassword(
        password,
        user.password_hash,
        c.cfg.pepper,
        c.cfg.pbkdf2Iterations,
      );
      if (!ok) {
        await recordAttempt(c.env.DB, limitKey, LOGIN_POLICY, now);
        throw new ApiError(401, "invalid_credentials", "用户名或密码不正确。");
      }

      // 密码算法参数升级：登录成功后用当前配置重算哈希
      if (needsRehash) {
        const upgraded = await hashPassword(password, c.cfg.pepper, c.cfg.pbkdf2Iterations);
        c.ctx.waitUntil(updatePasswordHash(c.env.DB, user.id, upgraded, now));
      }

      const { token, expiresAt } = await createSession(c.env.DB, c.cfg, user.id, c.request, now);

      c.ctx.waitUntil(
        Promise.all([
          clearAttempts(c.env.DB, limitKey),
          touchLastLogin(c.env.DB, user.id, now),
          // 顺手清理该用户已过期的其它会话
          c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(user.id, now).run(),
        ]),
      );

      user.last_login_at = now;
      return jsonResponse({ user: toPublicUser(user), token, expiresAt }, 200, {
        "Set-Cookie": buildSessionCookie(token, c.cfg),
      });
    },
  },
  {
    method: "POST",
    pattern: "/api/auth/logout",
    handler: async (c) => {
      await destroySession(c.env, c.request);
      return noContent({ "Set-Cookie": buildClearCookie(c.cfg) });
    },
  },
  {
    method: "GET",
    pattern: "/api/auth/me",
    handler: async (c) => {
      const { user, session } = await requireUser(c);
      return jsonResponse({ user: toPublicUser(user), session: { expiresAt: session.expires_at } });
    },
  },
];
