import { BACKEND_VERSION, LIMITS } from "../config.ts";
import { jsonResponse } from "../http.ts";
import type { Route } from "../router.ts";

/**
 * 元信息端点（无需登录）：
 *   GET /api/health  健康检查 + D1 连通性
 *   GET /api/meta    前端可用的公开配置（是否开放注册、各字段长度约束等）
 *   GET /api         路由索引（便于人工排查）
 */

export const metaRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/api/health",
    handler: async (c) => {
      let database = "unknown";
      try {
        const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        database = row?.ok === 1 ? "ok" : "unexpected";
      } catch (err) {
        console.error("[health] D1 探测失败", err);
        database = "error";
      }
      return jsonResponse(
        {
          service: "autumn-autools-api",
          version: BACKEND_VERSION,
          environment: c.cfg.environment,
          time: new Date().toISOString(),
          database,
          registrationOpen: c.cfg.allowRegistration,
        },
        database === "ok" ? 200 : 503,
      );
    },
  },
  {
    method: "GET",
    pattern: "/api/meta",
    handler: (c) =>
      jsonResponse({
        service: "autumn-autools-api",
        version: BACKEND_VERSION,
        appName: c.cfg.appName,
        registrationOpen: c.cfg.allowRegistration,
        sessionTtlDays: Math.round(c.cfg.sessionTtlMs / (24 * 60 * 60 * 1000)),
        limits: {
          usernameMin: LIMITS.usernameMin,
          usernameMax: LIMITS.usernameMax,
          passwordMin: LIMITS.passwordMin,
          passwordMax: LIMITS.passwordMax,
          displayNameMax: LIMITS.displayNameMax,
          plansBytes: c.cfg.plansBytes,
          settingsBytes: c.cfg.settingsBytes,
        },
      }),
  },
  {
    method: "GET",
    pattern: "/api",
    handler: () =>
      jsonResponse({
        service: "autumn-autools-api",
        version: BACKEND_VERSION,
        endpoints: [
          "GET    /api/health",
          "GET    /api/meta",
          "POST   /api/auth/register   { username, password, email?, displayName? }",
          "POST   /api/auth/login      { username, password }",
          "POST   /api/auth/logout",
          "GET    /api/auth/me",
          "GET    /api/settings",
          "PUT    /api/settings        { data: {...} }   [If-Match: <revision>]",
          "DELETE /api/settings",
          "GET    /api/plans",
          "PUT    /api/plans           { data: {...} }   [If-Match: <revision>]",
          "DELETE /api/plans",
          "GET    /api/account/export",
          "POST   /api/account/password { currentPassword, newPassword }",
          "DELETE /api/account         { password }",
        ],
      }),
  },
];
