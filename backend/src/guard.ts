import { ApiError } from "./http.ts";
import type { RouteContext } from "./router.ts";
import { resolveSession } from "./session.ts";
import type { SessionRow, UserRow } from "./types.ts";

/** 需要登录的端点统一入口：校验会话失败即 401 */
export async function requireUser(c: RouteContext): Promise<{ user: UserRow; session: SessionRow }> {
  const resolved = await resolveSession(c.env, c.cfg, c.request, c.ctx);
  if (!resolved) {
    throw new ApiError(401, "unauthorized", "登录状态无效或已过期，请重新登录。");
  }
  return resolved;
}
