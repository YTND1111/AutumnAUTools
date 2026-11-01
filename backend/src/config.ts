import type { Env } from "./types.ts";

/** 后端自身版本号（展示于 /api/health，与前端 app/src/config.ts 无强绑定） */
export const BACKEND_VERSION = "1.0.0";

/** 用户名/密码等输入约束（前端 AuthPanel 会同步展示同一套文案） */
export const LIMITS = {
  usernameMin: 3,
  usernameMax: 32,
  passwordMin: 8,
  passwordMax: 128,
  displayNameMax: 32,
  emailMax: 128,
  /** 设置类 JSON 上限（字节） */
  settingsBytes: 32 * 1024,
  /** 方案类 JSON 上限受 MAX_PAYLOAD_KB 控制，这里是绝对上限 */
  plansBytes: 1024 * 1024,
} as const;

export interface AppConfig {
  appName: string;
  environment: string;
  /** 允许的来源列表；空数组 = 不放行任何跨域来源（同源仍可用） */
  allowedOrigins: string[];
  allowAllOrigins: boolean;
  allowRegistration: boolean;
  sessionTtlMs: number;
  pbkdf2Iterations: number;
  pepper: string;
  maxPayloadBytes: number;
  settingsBytes: number;
  plansBytes: number;
  secureCookies: boolean;
}

function readInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 从 Worker 绑定/环境变量解析出运行期配置（每次请求解析一次，开销可忽略） */
export function readConfig(env: Env): AppConfig {
  const originsRaw = (env.ALLOWED_ORIGINS ?? "").trim();
  const origins = originsRaw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    appName: env.APP_NAME ?? "秋功 AutumnAUTools",
    environment: env.ENVIRONMENT ?? "development",
    allowedOrigins: origins.filter((item) => item !== "*"),
    allowAllOrigins: origins.includes("*"),
    // 默认开放注册；显式写 "false" 才关闭（便于私有部署）
    allowRegistration: (env.ALLOW_REGISTRATION ?? "true").toLowerCase() !== "false",
    sessionTtlMs: readInt(env.SESSION_TTL_DAYS, 30, 1, 365) * 24 * 60 * 60 * 1000,
    // 100000 次 ≈ 30ms 原生 CPU；免费套餐 CPU 上限低，可按需下调（见 README）
    pbkdf2Iterations: readInt(env.PBKDF2_ITERATIONS, 100_000, 10_000, 1_000_000),
    pepper: env.AUTH_PEPPER ?? "",
    maxPayloadBytes: readInt(env.MAX_PAYLOAD_KB, 256, 1, 4096) * 1024,
    settingsBytes: LIMITS.settingsBytes,
    plansBytes: LIMITS.plansBytes,
    // Cloudflare 上生产必然是 https；本地 http://localhost:8787 走非 Secure Cookie
    secureCookies: (env.ENVIRONMENT ?? "development") === "production",
  };
}
