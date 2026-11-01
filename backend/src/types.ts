/**
 * 运行时类型声明（零依赖自声明版 D1 / Workers 绑定）。
 *
 * 为什么自己声明而不用 @cloudflare/workers-types：
 *   本项目刻意保持 **零运行时依赖 + 零类型依赖**，这样一个 clone 下来就能跑
 *   `node scripts/smoke-test.mjs` 做端到端自测，也便于离线开发。
 *
 * 如果你更希望使用官方类型：
 *   1) pnpm add -D @cloudflare/workers-types
 *   2) 删除本文件，并在 tsconfig.json 的 compilerOptions 里加
 *      "types": ["@cloudflare/workers-types"]
 *   3) 或直接 `wrangler types` 生成 worker-configuration.d.ts（同样建议删掉本文件）
 *   只需保证 Env / ExecutionContext 这两个名字依然可用。
 */

/** D1 查询结果（字段名与 Cloudflare 官方 D1Result 对齐） */
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<{ success: boolean; meta: Record<string, unknown> }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

/** Workers ExecutionContext 的最小子集（waitUntil 用于「响应后继续写库」） */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Worker 绑定与环境变量（见 wrangler.toml 与 .dev.vars.example） */
export interface Env {
  /** D1 数据库绑定（wrangler.toml 的 [[d1_databases]] binding = "DB"） */
  DB: D1Database;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  /** 允许跨域的来源，逗号分隔；"*" = 全部放行 */
  ALLOWED_ORIGINS?: string;
  /** 是否开放注册："true" / "false" */
  ALLOW_REGISTRATION?: string;
  SESSION_TTL_DAYS?: string;
  PBKDF2_ITERATIONS?: string;
  /** 密码胡椒（secret，强烈建议设置） */
  AUTH_PEPPER?: string;
  MAX_PAYLOAD_KB?: string;
}

// ── 数据库行类型 ────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  display_name: string | null;
  email: string | null;
  email_lower: string | null;
  password_hash: string;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent: string | null;
  ip: string | null;
}

export interface UserDataRow {
  user_id: string;
  data: string;
  revision: number;
  updated_at: number;
}

export interface AuthAttemptRow {
  key: string;
  count: number;
  window_start: number;
  locked_until: number | null;
}

/** 可上云的两类用户数据（表白名单，防止 SQL 拼接被注入） */
export type DataTable = "user_settings" | "user_plans";

/** 对外暴露的用户信息（绝不含 password_hash） */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}
