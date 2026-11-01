import { LIMITS } from "./config.ts";
import { ApiError } from "./http.ts";

/** 是否为「纯对象」（排除数组 / null / 其它类型） */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 断言某个字段是纯对象 */
export function assertObjectField(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ApiError(400, "invalid_field", `字段 ${field} 必须是 JSON 对象。`, { field });
  }
  return value;
}

/**
 * 用户名归一化与校验。
 * 允许 3~32 位的字母 / 数字 / 下划线 / 连字符 / 汉字，其它字符拒绝。
 * 返回 { raw, lower }：raw 用于展示，lower 用于唯一约束与登录查询。
 */
export function normalizeUsername(value: unknown): { raw: string; lower: string } {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_username", "用户名必须是字符串。", { field: "username" });
  }
  const raw = value.trim();
  const length = Array.from(raw).length;
  if (length < LIMITS.usernameMin || length > LIMITS.usernameMax) {
    throw new ApiError(
      400,
      "invalid_username",
      `用户名长度需在 ${LIMITS.usernameMin}~${LIMITS.usernameMax} 个字符之间。`,
      { field: "username" },
    );
  }
  if (!/^[\w\-\u4e00-\u9fa5]+$/u.test(raw)) {
    throw new ApiError(400, "invalid_username", "用户名只能包含字母、数字、下划线、连字符或汉字。", {
      field: "username",
    });
  }
  return { raw, lower: raw.toLowerCase() };
}

/** 密码校验：只做长度与可打印性检查，不做复杂度强制（避免削弱熵） */
export function assertPassword(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_password", "密码必须是字符串。", { field: "password" });
  }
  const length = value.length;
  if (length < LIMITS.passwordMin || length > LIMITS.passwordMax) {
    throw new ApiError(
      400,
      "invalid_password",
      `密码长度需在 ${LIMITS.passwordMin}~${LIMITS.passwordMax} 个字符之间。`,
      { field: "password" },
    );
  }
  return value;
}

/** 邮箱（可选字段）：缺失/空串视为 null，格式宽松校验（仅用于找回联系，不作登录键） */
export function normalizeEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_email", "邮箱必须是字符串。", { field: "email" });
  }
  const email = value.trim();
  if (email.length === 0) return null;
  if (email.length > LIMITS.emailMax || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid_email", "邮箱格式不正确。", { field: "email" });
  }
  return email;
}

/** 展示名（可选字段） */
export function normalizeDisplayName(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_display_name", "昵称必须是字符串。", { field: "displayName" });
  }
  const name = value.trim();
  if (name.length === 0) return null;
  if (Array.from(name).length > LIMITS.displayNameMax) {
    throw new ApiError(400, "invalid_display_name", `昵称最长 ${LIMITS.displayNameMax} 个字符。`, {
      field: "displayName",
    });
  }
  return name;
}

/** 危险键名：虽然 JSON.parse 不会触发原型链污染，仍在入库前拦截，保持数据干净 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 校验待上云的用户数据对象（设置 / 方案快照） */
export function assertUserData(value: unknown, field = "data"): Record<string, unknown> {
  const data = assertObjectField(value, field);
  for (const key of Object.keys(data)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new ApiError(400, "invalid_data", `data 中不允许出现键名 ${key}。`, { field, key });
    }
  }
  return data;
}
