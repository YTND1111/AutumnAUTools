import { deleteUserData, readUserData, writeUserData } from "../db.ts";
import { requireUser } from "../guard.ts";
import { ApiError, jsonResponse, noContent, readJsonBody } from "../http.ts";
import type { Route } from "../router.ts";
import type { DataTable } from "../types.ts";
import { assertUserData } from "../validate.ts";

/**
 * 用户数据端点（设置 / 配课方案，两者同构）：
 *   GET    /api/settings   → { data, revision, updatedAt }
 *   PUT    /api/settings   → { revision, updatedAt }（body: { data: {...} }）
 *   DELETE /api/settings   → 204（清空云端数据，前端回退到默认值）
 *   GET/PUT/DELETE /api/plans 同上
 *
 * 并发控制（可选）：PUT 带 `If-Match: <revision>` 时做乐观锁校验，
 * 不一致返回 409 并回带服务端当前数据；不带该头则「最后写入者获胜」。
 * 前端 app/src/services/cloudProvider.ts 默认不加该头（多设备下以最后一次改动为准）。
 */

interface DataKind {
  kind: "settings" | "plans";
  table: DataTable;
  path: string;
  /** 单次请求体上限（字节） */
  maxBytes: (cfg: { settingsBytes: number; plansBytes: number; maxPayloadBytes: number }) => number;
  /** 该端点未存过数据时，前端应回退的默认值（由前端决定，这里只回 null） */
}

const KINDS: DataKind[] = [
  {
    kind: "settings",
    table: "user_settings",
    path: "/api/settings",
    maxBytes: (cfg) => Math.min(cfg.settingsBytes, cfg.maxPayloadBytes),
  },
  {
    kind: "plans",
    table: "user_plans",
    path: "/api/plans",
    maxBytes: (cfg) => Math.min(cfg.plansBytes, cfg.maxPayloadBytes),
  },
];

/** 解析 If-Match 头 → revision（缺失或 "*" 返回 null） */
function parseIfMatch(request: Request): number | null {
  const raw = request.headers.get("If-Match");
  if (!raw) return null;
  const cleaned = raw.replace(/^W\//i, "").replace(/"/g, "").trim();
  if (cleaned === "" || cleaned === "*") return null;
  const value = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new ApiError(400, "invalid_if_match", "If-Match 头必须是数字 revision。");
  }
  return value;
}

function etagOf(revision: number): string {
  return `"${revision}"`;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function buildRoutes(kind: DataKind): Route[] {
  return [
    {
      method: "GET",
      pattern: kind.path,
      handler: async (c) => {
        const { user } = await requireUser(c);
        const row = await readUserData(c.env.DB, kind.table, user.id);
        if (!row) {
          return jsonResponse({ data: null, revision: 0, updatedAt: null }, 200, { ETag: etagOf(0) });
        }
        return jsonResponse(
          { data: safeParse(row.data), revision: row.revision, updatedAt: row.updated_at },
          200,
          { ETag: etagOf(row.revision) },
        );
      },
    },
    {
      method: "PUT",
      pattern: kind.path,
      handler: async (c) => {
        const { user } = await requireUser(c);
        const body = await readJsonBody(c.request, kind.maxBytes(c.cfg));
        const data = assertUserData(body.data);
        const baseRevision = parseIfMatch(c.request);
        const now = Date.now();
        const row = await writeUserData(c.env.DB, kind.table, user.id, JSON.stringify(data), baseRevision, now);
        return jsonResponse(
          { kind: kind.kind, revision: row.revision, updatedAt: row.updated_at },
          200,
          { ETag: etagOf(row.revision) },
        );
      },
    },
    {
      method: "DELETE",
      pattern: kind.path,
      handler: async (c) => {
        const { user } = await requireUser(c);
        await deleteUserData(c.env.DB, kind.table, user.id);
        return noContent();
      },
    },
  ];
}

export const dataRoutes: Route[] = KINDS.flatMap((kind) => buildRoutes(kind));
