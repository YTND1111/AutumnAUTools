import { readConfig } from "./config.ts";
import { ApiError, applyHeaders, corsHeaders, errorResponse } from "./http.ts";
import type { Route } from "./router.ts";
import { allowedMethods, matchRoute } from "./router.ts";
import { accountRoutes } from "./routes/account.ts";
import { authRoutes } from "./routes/auth.ts";
import { dataRoutes } from "./routes/data.ts";
import { metaRoutes } from "./routes/meta.ts";
import type { Env, ExecutionContext } from "./types.ts";

/**
 * 秋功用户后端 —— Cloudflare Worker 入口。
 *
 * 技术选型（针对 Cloudflare 免费额度做了适配）：
 *   * 运行时：Workers（模块语法，fetch 处理器），零运行时依赖，无 nodejs_compat；
 *   * 存储：D1（Serverless SQLite，免费额度 5GB / 500万行读每天）；
 *   * 加密：Web Crypto（PBKDF2-SHA256 口令哈希 + HMAC 胡椒 + SHA-256 会话摘要）；
 *   * 会话：不透明随机 token（D1 存摘要，可随时吊销），Bearer 头 + HttpOnly Cookie 双通道；
 *   * 定时任务：Cron Trigger 每日清理过期会话与限流计数行。
 *
 * 路由表见 src/routes/，或访问 GET /api 查看自描述索引。
 */

const routes: Route[] = [...metaRoutes, ...authRoutes, ...dataRoutes, ...accountRoutes];

function withCors(response: Response, cors: Record<string, string>): Response {
  return applyHeaders(response, cors);
}

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cfg = readConfig(env);
  const cors = corsHeaders(request, cfg);

  // CORS 预检：来源在白名单内才回显 ACAO，否则浏览器自行拦截
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const url = new URL(request.url);
    const matched = matchRoute(routes, request.method, url.pathname);

    if (!matched) {
      const methods = allowedMethods(routes, url.pathname);
      if (methods.length > 1) {
        throw new ApiError(
          405,
          "method_not_allowed",
          `该路径不支持 ${request.method} 方法。`,
          { allow: methods },
          { Allow: methods.join(", ") },
        );
      }
      throw new ApiError(404, "not_found", "接口不存在。", { path: url.pathname });
    }

    const response = await matched.route.handler({ request, env, cfg, ctx, url, params: matched.params });
    return withCors(response, cors);
  } catch (err) {
    return withCors(errorResponse(err), cors);
  }
}

/** 定时清理：过期会话 + 超过 30 天的限流计数行（避免 D1 无限膨胀） */
async function handleScheduled(env: Env): Promise<void> {
  const now = Date.now();
  const staleAttemptsBefore = now - 30 * 24 * 60 * 60 * 1000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM auth_attempts WHERE window_start <= ?").bind(staleAttemptsBefore),
  ]);
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
  async scheduled(_controller: { scheduledTime: number; cron: string }, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
