import { ApiError } from "./http.ts";
import type { DataTable, D1Database, PublicUser, UserDataRow, UserRow } from "./types.ts";

/**
 * D1 数据访问层：所有 SQL 集中在此，路由层只调用语义化函数。
 * 表名只接受 DataTable 联合类型（user_settings / user_plans），不存在字符串拼接注入。
 */

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

// ── 用户 ────────────────────────────────────────────────────────────────────

export async function findUserByUsernameLower(db: D1Database, usernameLower: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE username_lower = ?").bind(usernameLower).first<UserRow>();
}

export async function findUserByEmailLower(db: D1Database, emailLower: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE email_lower = ?").bind(emailLower).first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export interface NewUser {
  id: string;
  username: string;
  usernameLower: string;
  displayName: string | null;
  email: string | null;
  emailLower: string | null;
  passwordHash: string;
  now: number;
}

export async function insertUser(db: D1Database, user: NewUser): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, email, email_lower, password_hash, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      user.id,
      user.username,
      user.usernameLower,
      user.displayName,
      user.email,
      user.emailLower,
      user.passwordHash,
      user.now,
      user.now,
    )
    .run();
}

export async function updatePasswordHash(db: D1Database, userId: string, passwordHash: string, now: number): Promise<void> {
  await db
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, now, userId)
    .run();
}

export async function touchLastLogin(db: D1Database, userId: string, now: number): Promise<void> {
  await db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now, userId).run();
}

/** 删除账号及其全部关联数据（显式删除，不依赖外键级联是否开启） */
export async function deleteUserCascade(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_settings WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_plans WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

// ── 设置 / 方案（同构的两张表） ──────────────────────────────────────────────

export async function readUserData(db: D1Database, table: DataTable, userId: string): Promise<UserDataRow | null> {
  return db.prepare(`SELECT user_id, data, revision, updated_at FROM ${table} WHERE user_id = ?`).bind(userId).first<UserDataRow>();
}

/**
 * 写入用户数据（upsert），带乐观锁：
 * - baseRevision 为 null → 无条件覆盖（最后写入者获胜，前端默认行为）；
 * - baseRevision 为数字 → 与库中 revision 不一致时抛 409，并把服务端当前值一并返回，
 *   供客户端决定合并还是强制覆盖（请求头 If-Match）。
 */
export async function writeUserData(
  db: D1Database,
  table: DataTable,
  userId: string,
  json: string,
  baseRevision: number | null,
  now: number,
): Promise<UserDataRow> {
  const current = await readUserData(db, table, userId);

  if (baseRevision !== null && current && current.revision !== baseRevision) {
    throw new ApiError(409, "revision_conflict", "云端数据已被其它设备更新，请刷新后重试。", {
      revision: current.revision,
      updatedAt: current.updated_at,
      data: safeParse(current.data),
    });
  }

  const revision = (current?.revision ?? 0) + 1;
  await db
    .prepare(
      `INSERT INTO ${table} (user_id, data, revision, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at`,
    )
    .bind(userId, json, revision, now)
    .run();

  return { user_id: userId, data: json, revision, updated_at: now };
}

export async function deleteUserData(db: D1Database, table: DataTable, userId: string): Promise<void> {
  await db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run();
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
