import { hashPassword, verifyPassword } from "../crypto.ts";
import { deleteUserCascade, readUserData, toPublicUser } from "../db.ts";
import { requireUser } from "../guard.ts";
import { ApiError, clientIp, jsonResponse, noContent, readJsonBody } from "../http.ts";
import {
  SENSITIVE_POLICY,
  checkRateLimit,
  clearAttempts,
  recordAttempt,
  retryAfterHeaders,
} from "../ratelimit.ts";
import type { Route } from "../router.ts";
import { buildClearCookie, buildSessionCookie, createSession, destroyAllSessions } from "../session.ts";
import { assertPassword } from "../validate.ts";

/**
 * 账号管理端点：
 *   GET    /api/account/export    导出该用户的全部云端数据（JSON 下载）
 *   POST   /api/account/password  修改密码（需当前密码；成功后其它设备全部下线）
 *   DELETE /api/account           注销账号（需当前密码，级联删除全部数据）
 */

export const accountRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/api/account/export",
    handler: async (c) => {
      const { user } = await requireUser(c);
      const [settings, plans] = await Promise.all([
        readUserData(c.env.DB, "user_settings", user.id),
        readUserData(c.env.DB, "user_plans", user.id),
      ]);
      return jsonResponse({
        exportedAt: new Date().toISOString(),
        user: toPublicUser(user),
        settings: settings
          ? { data: JSON.parse(settings.data), revision: settings.revision, updatedAt: settings.updated_at }
          : null,
        plans: plans
          ? { data: JSON.parse(plans.data), revision: plans.revision, updatedAt: plans.updated_at }
          : null,
      });
    },
  },
  {
    method: "POST",
    pattern: "/api/account/password",
    handler: async (c) => {
      const now = Date.now();
      const { user } = await requireUser(c);
      const limitKey = `password:${clientIp(c.request)}:${user.id}`;

      const limit = await checkRateLimit(c.env.DB, limitKey, SENSITIVE_POLICY, now);
      if (!limit.allowed) {
        throw new ApiError(
          429,
          "rate_limited",
          "操作过于频繁，请稍后再试。",
          { retryAfterSec: limit.retryAfterSec },
          retryAfterHeaders(limit.retryAfterSec),
        );
      }

      const body = await readJsonBody(c.request, c.cfg.maxPayloadBytes);
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = assertPassword(body.newPassword);

      const { ok } = await verifyPassword(
        currentPassword,
        user.password_hash,
        c.cfg.pepper,
        c.cfg.pbkdf2Iterations,
      );
      if (!ok) {
        c.ctx.waitUntil(recordAttempt(c.env.DB, limitKey, SENSITIVE_POLICY, now));
        throw new ApiError(401, "invalid_credentials", "当前密码不正确。");
      }

      const passwordHash = await hashPassword(newPassword, c.cfg.pepper, c.cfg.pbkdf2Iterations);
      await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(passwordHash, now, user.id)
        .run();

      // 全部会话失效后重新签发当前设备的会话
      await destroyAllSessions(c.env.DB, user.id);
      const { token, expiresAt } = await createSession(c.env.DB, c.cfg, user.id, c.request, now);

      c.ctx.waitUntil(clearAttempts(c.env.DB, limitKey));
      return jsonResponse({ ok: true, token, expiresAt }, 200, { "Set-Cookie": buildSessionCookie(token, c.cfg) });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/account",
    handler: async (c) => {
      const now = Date.now();
      const { user } = await requireUser(c);
      const limitKey = `delete:${clientIp(c.request)}:${user.id}`;

      const limit = await checkRateLimit(c.env.DB, limitKey, SENSITIVE_POLICY, now);
      if (!limit.allowed) {
        throw new ApiError(
          429,
          "rate_limited",
          "操作过于频繁，请稍后再试。",
          { retryAfterSec: limit.retryAfterSec },
          retryAfterHeaders(limit.retryAfterSec),
        );
      }

      const body = await readJsonBody(c.request, c.cfg.maxPayloadBytes);
      const password = typeof body.password === "string" ? body.password : "";

      const { ok } = await verifyPassword(password, user.password_hash, c.cfg.pepper, c.cfg.pbkdf2Iterations);
      if (!ok) {
        c.ctx.waitUntil(recordAttempt(c.env.DB, limitKey, SENSITIVE_POLICY, now));
        throw new ApiError(401, "invalid_credentials", "密码不正确，无法注销账号。");
      }

      await deleteUserCascade(c.env.DB, user.id);
      return noContent({ "Set-Cookie": buildClearCookie(c.cfg) });
    },
  },
];
