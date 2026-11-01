/**
 * 本地 D1 桩（用于零依赖冒烟测试）
 *
 * 用 Node 24 内置的 node:sqlite 实现 Cloudflare D1 的最小 API 子集
 * （prepare / bind / first / all / run / batch / exec），
 * 使 src/ 下的真实 Worker 代码可以在本机被完整端到端调用——
 * 不需要 wrangler、不需要网络、不需要任何 npm 依赖。
 *
 * ⚠️ 用途仅限测试：D1 的真实行为（并发、一致性、元数据、迁移工具链）
 *    仍需以 `wrangler dev` / 远程 D1 为准。
 */

import { DatabaseSync } from "node:sqlite";

/** node:sqlite 不接受 boolean / undefined 作为绑定值，这里归一化 */
function normalizeArg(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  return value;
}

/** 把 node:sqlite 的 null 原型行对象转成普通对象（与 D1 返回一致，便于 JSON 序列化） */
function toPlainRow(row) {
  return row ? { ...row } : row;
}

class ShimStatement {
  constructor(sqlite, sql, args) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.args = args;
  }

  bind(...values) {
    return new ShimStatement(this.sqlite, this.sql, values.map(normalizeArg));
  }

  async first(colName) {
    const row = this.sqlite.prepare(this.sql).get(...this.args);
    if (row === undefined) return null;
    if (colName) return toPlainRow(row)[colName] ?? null;
    return toPlainRow(row);
  }

  async all() {
    const rows = this.sqlite.prepare(this.sql).all(...this.args).map(toPlainRow);
    return { results: rows, success: true, meta: { rows_read: rows.length } };
  }

  async run() {
    const info = this.sqlite.prepare(this.sql).run(...this.args);
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }

  /** 测试内部使用：同步执行并返回行（便于断言表结构） */
  syncAll() {
    return this.sqlite.prepare(this.sql).all(...this.args).map(toPlainRow);
  }
}

/**
 * 创建一个 D1 兼容对象
 * @param {import("node:sqlite").DatabaseSync} sqlite
 */
export function createD1(sqlite) {
  return {
    prepare(sql) {
      return new ShimStatement(sqlite, sql, []);
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

/** 建一个内存库（也可传文件路径以保留数据） */
export function createTestDatabase(location = ":memory:") {
  return new DatabaseSync(location);
}
