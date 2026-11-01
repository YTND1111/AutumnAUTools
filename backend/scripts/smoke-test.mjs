/**
 * 冒烟测试：用真实的 Worker 代码 + 真实的 SQLite（node:sqlite 模拟 D1）
 * 跑通「注册 → 登录 → 云端设置/方案读写 → CORS/限流/越权 → 改密 → 删号」全流程。
 *
 * 运行：node scripts/smoke-test.mjs     （或 pnpm test）
 * 依赖：仅 Node >= 22.6（需要 node:sqlite 与原生 TS 类型擦除），零 npm 依赖。
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createD1, createTestDatabase } from "./d1-shim.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const migrationsDir = path.join(backendRoot, "migrations");

// ── 1. 建库并套用迁移 ───────────────────────────────────────────────────────
const sqlite = createTestDatabase(":memory:");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const file of migrationFiles) {
  sqlite.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
}
console.log(`[setup] 已套用 ${migrationFiles.length} 个迁移文件：${migrationFiles.join(", ")}`);

// ── 2. 组装 Worker 运行环境 ─────────────────────────────────────────────────
const env = {
  DB: createD1(sqlite),
  ENVIRONMENT: "test",
  APP_NAME: "秋功测试",
  ALLOWED_ORIGINS: "http://localhost:3000",
  ALLOW_REGISTRATION: "true",
  SESSION_TTL_DAYS: "30",
  // 测试用低迭代次数（生产默认 100000）
  PBKDF2_ITERATIONS: "10000",
  AUTH_PEPPER: "smoke-test-pepper",
  MAX_PAYLOAD_KB: "64",
};

const { default: worker } = await import("../src/index.ts");

function createCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
    passThroughOnException() {},
    async drain() {
      await Promise.all(pending.splice(0, pending.length));
    },
  };
}

/** 调用 Worker 的 fetch 处理器 */
async function call(method, urlPath, options = {}) {
  const { body, token, cookie, origin, headers: extraHeaders, ip = "203.0.113.7" } = options;
  const headers = new Headers({ "CF-Connecting-IP": ip, ...(extraHeaders ?? {}) });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (cookie) headers.set("Cookie", cookie);
  if (origin) headers.set("Origin", origin);

  const request = new Request(`https://api.example.com${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ctx = createCtx();
  const response = await worker.fetch(request, env, ctx);
  await ctx.drain();
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON 响应（正常不会出现） */
  }
  return { status: response.status, headers: response.headers, json, text };
}

// ── 3. 断言工具 ─────────────────────────────────────────────────────────────
let passed = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failures.push(name);
  console.error(`  ✗ ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`);
}

function section(title) {
  console.log(`\n${title}`);
}

const USER_A = { username: "smoke_alice", password: "alice-password-123", displayName: "爱丽丝" };
const USER_B = { username: "smoke_bob", password: "bob-password-456", email: "bob@example.com" };

// ── 4. 用例 ─────────────────────────────────────────────────────────────────

section("① 元信息 / 健康检查");
{
  const health = await call("GET", "/api/health");
  check("GET /api/health → 200", health.status === 200, health.json);
  check("D1 连通性 ok", health.json?.database === "ok", health.json);

  const meta = await call("GET", "/api/meta");
  check("GET /api/meta → 200", meta.status === 200, meta.json);
  check("开放注册标记", meta.json?.registrationOpen === true, meta.json);
  check("返回口令长度约束", meta.json?.limits?.passwordMin === 8, meta.json?.limits);

  const index = await call("GET", "/api");
  check("GET /api 返回路由索引", index.status === 200 && Array.isArray(index.json?.endpoints));

  const missing = await call("GET", "/api/does-not-exist");
  check("未知路径 → 404", missing.status === 404 && missing.json?.error?.code === "not_found", missing.json);

  const wrongMethod = await call("DELETE", "/api/health");
  check("方法不符 → 405 + Allow 头", wrongMethod.status === 405 && Boolean(wrongMethod.headers.get("Allow")), {
    status: wrongMethod.status,
    allow: wrongMethod.headers.get("Allow"),
  });
}

section("② CORS 预检");
{
  const ok = await call("OPTIONS", "/api/auth/login", { origin: "http://localhost:3000" });
  check("白名单来源 → 204 + ACAO", ok.status === 204 && ok.headers.get("Access-Control-Allow-Origin") === "http://localhost:3000", {
    status: ok.status,
    acao: ok.headers.get("Access-Control-Allow-Origin"),
  });

  const bad = await call("OPTIONS", "/api/auth/login", { origin: "http://evil.example" });
  check("未授权来源 → 不回显 ACAO", bad.status === 204 && bad.headers.get("Access-Control-Allow-Origin") === null);

  const withOrigin = await call("GET", "/api/health", { origin: "http://localhost:3000" });
  check("普通响应带 ACAO + credentials", withOrigin.headers.get("Access-Control-Allow-Credentials") === "true");
}

section("③ 注册");
let aliceToken = null;
{
  const weak = await call("POST", "/api/auth/register", { body: { username: USER_A.username, password: "123" } });
  check("弱密码 → 400 invalid_password", weak.status === 400 && weak.json?.error?.code === "invalid_password", weak.json);

  const badName = await call("POST", "/api/auth/register", { body: { username: "ab", password: USER_A.password } });
  check("用户名过短 → 400 invalid_username", badName.status === 400 && badName.json?.error?.code === "invalid_username");

  const created = await call("POST", "/api/auth/register", { body: USER_A });
  check("注册成功 → 201", created.status === 201, created.json);
  check("返回 token 与用户信息", typeof created.json?.token === "string" && created.json?.user?.username === USER_A.username);
  check("响应不含密码哈希", created.text.includes("password_hash") === false && created.text.includes("pbkdf2") === false);
  check("下发 HttpOnly 会话 Cookie", (created.headers.get("Set-Cookie") ?? "").includes("HttpOnly"));
  aliceToken = created.json?.token;

  const dup = await call("POST", "/api/auth/register", { body: USER_A });
  check("重复用户名 → 409 username_taken", dup.status === 409 && dup.json?.error?.code === "username_taken", dup.json);

  const dupCase = await call("POST", "/api/auth/register", { body: { ...USER_A, username: USER_A.username.toUpperCase() } });
  check("大小写不同的同名 → 409", dupCase.status === 409, dupCase.json);

  const bob = await call("POST", "/api/auth/register", { body: USER_B });
  check("第二个用户注册成功", bob.status === 201, bob.json);

  const dupEmail = await call("POST", "/api/auth/register", {
    body: { username: "smoke_carol", password: "carol-password-789", email: USER_B.email },
  });
  check("重复邮箱 → 409 email_taken", dupEmail.status === 409 && dupEmail.json?.error?.code === "email_taken", dupEmail.json);
}

section("④ 会话校验");
{
  const noAuth = await call("GET", "/api/auth/me");
  check("无 token → 401", noAuth.status === 401 && noAuth.json?.error?.code === "unauthorized", noAuth.json);

  const badToken = await call("GET", "/api/auth/me", { token: "not-a-real-token" });
  check("伪造 token → 401", badToken.status === 401);

  const me = await call("GET", "/api/auth/me", { token: aliceToken });
  check("Bearer token → 200", me.status === 200 && me.json?.user?.username === USER_A.username, me.json);
  check("会话返回过期时间", typeof me.json?.session?.expiresAt === "number");
  check("登录次数未设置 lastLoginAt（注册即登录）", me.json?.user?.lastLoginAt === null, me.json?.user);

  const viaCookie = await call("GET", "/api/auth/me", { cookie: `autumn_session=${encodeURIComponent(aliceToken)}` });
  check("同源 Cookie 通道亦可鉴权", viaCookie.status === 200, viaCookie.json);
}

section("⑤ 登录 / 限流");
{
  const wrong = await call("POST", "/api/auth/login", { body: { username: USER_A.username, password: "wrong-password" } });
  check("错误密码 → 401 invalid_credentials", wrong.status === 401 && wrong.json?.error?.code === "invalid_credentials", wrong.json);

  const unknownUser = await call("POST", "/api/auth/login", { body: { username: "no_such_user", password: "whatever-123" } });
  check("不存在的用户 → 401（不泄露账号是否存在）", unknownUser.status === 401 && unknownUser.json?.error?.code === "invalid_credentials");

  const okLogin = await call("POST", "/api/auth/login", { body: USER_A });
  check("正确密码 → 200 + token", okLogin.status === 200 && typeof okLogin.json?.token === "string", okLogin.json);
  check("登录后记录 lastLoginAt", typeof okLogin.json?.user?.lastLoginAt === "number");

  // 连续失败触发锁定
  const lockUser = { username: "smoke_lock", password: "lock-password-123" };
  await call("POST", "/api/auth/register", { body: lockUser });
  for (let i = 0; i < 10; i += 1) {
    await call("POST", "/api/auth/login", { body: { username: lockUser.username, password: "bad-password" } });
  }
  const locked = await call("POST", "/api/auth/login", { body: lockUser });
  check("失败 10 次后锁定 → 429", locked.status === 429 && locked.json?.error?.code === "rate_limited", locked.json);
  check("429 带 Retry-After 头", Number(locked.headers.get("Retry-After")) > 0, locked.headers.get("Retry-After"));

  const otherIp = await call("POST", "/api/auth/login", { body: lockUser, ip: "198.51.100.9" });
  check("锁定按 IP+用户名 维度，其它 IP 不受影响", otherIp.status === 200, otherIp.json);
}

section("⑥ 云端设置（/api/settings）");
let bobToken = null;
{
  const empty = await call("GET", "/api/settings", { token: aliceToken });
  check("未存过数据 → data: null", empty.status === 200 && empty.json?.data === null, empty.json);

  const saved = await call("PUT", "/api/settings", {
    token: aliceToken,
    body: { data: { campusPreference: "east" } },
  });
  check("PUT 保存 → 200 revision=1", saved.status === 200 && saved.json?.revision === 1, saved.json);
  check("返回 ETag", saved.headers.get("ETag") === '"1"', saved.headers.get("ETag"));

  const loaded = await call("GET", "/api/settings", { token: aliceToken });
  check("GET 读回一致", loaded.json?.data?.campusPreference === "east", loaded.json);

  const overwrite = await call("PUT", "/api/settings", {
    token: aliceToken,
    body: { data: { campusPreference: "west" } },
  });
  check("再次保存 revision 递增", overwrite.json?.revision === 2, overwrite.json);

  const stale = await call("PUT", "/api/settings", {
    token: aliceToken,
    body: { data: { campusPreference: "none" } },
    headers: { "If-Match": '"1"' },
  });
  check("If-Match 过期 → 409 revision_conflict", stale.status === 409 && stale.json?.error?.code === "revision_conflict", stale.json);
  check("409 回带服务端当前数据", stale.json?.error?.details?.data?.campusPreference === "west", stale.json?.error?.details);

  const notObject = await call("PUT", "/api/settings", { token: aliceToken, body: { data: [1, 2, 3] } });
  check("data 非对象 → 400", notObject.status === 400, notObject.json);

  const proto = await call("PUT", "/api/settings", {
    token: aliceToken,
    body: { data: JSON.parse('{"__proto__":{"polluted":true}}') },
  });
  check("拒绝 __proto__ 键 → 400", proto.status === 400 && proto.json?.error?.code === "invalid_data", proto.json);

  const noAuth = await call("PUT", "/api/settings", { body: { data: { campusPreference: "east" } } });
  check("未登录写入 → 401", noAuth.status === 401);

  const noJson = await call("PUT", "/api/settings", {
    token: aliceToken,
    headers: { "Content-Type": "text/plain" },
    body: undefined,
  });
  check("非 JSON Content-Type → 400/415", [400, 415].includes(noJson.status), noJson.status);
}

section("⑦ 云端方案（/api/plans）与多用户隔离");
{
  const bobLogin = await call("POST", "/api/auth/login", { body: USER_B });
  bobToken = bobLogin.json?.token;
  check("bob 登录成功", bobLogin.status === 200, bobLogin.json);

  const plan = {
    version: 1,
    ownerId: null,
    cards: [{ courseCode: "12345", courseName: "高等数学", active: true, enabledTeachers: [], enabledCampuses: [], enabledTimes: [], enabledClasses: [] }],
    savedPlans: [],
    activePlanId: null,
    selectedWeek: "all",
    blockedCells: ["1-0"],
    blockedDays: [3],
    blockedPeriods: [],
    classGroups: [],
  };
  const put = await call("PUT", "/api/plans", { token: aliceToken, body: { data: plan } });
  check("alice 保存方案 → 200", put.status === 200, put.json);

  const alicePlans = await call("GET", "/api/plans", { token: aliceToken });
  check("alice 读回方案", alicePlans.json?.data?.cards?.[0]?.courseName === "高等数学", alicePlans.json);

  const bobPlans = await call("GET", "/api/plans", { token: bobToken });
  check("bob 看不到 alice 的方案（按用户隔离）", bobPlans.status === 200 && bobPlans.json?.data === null, bobPlans.json);

  const bobSettings = await call("GET", "/api/settings", { token: bobToken });
  check("bob 的设置独立", bobSettings.json?.data === null, bobSettings.json);

  const big = "x".repeat(70 * 1024);
  const oversized = await call("PUT", "/api/plans", { token: aliceToken, body: { data: { blob: big } } });
  check("超出 MAX_PAYLOAD_KB → 413", oversized.status === 413 && oversized.json?.error?.code === "payload_too_large", oversized.status);

  const reset = await call("DELETE", "/api/plans", { token: aliceToken });
  check("DELETE /api/plans → 204", reset.status === 204, reset.status);
  const afterReset = await call("GET", "/api/plans", { token: aliceToken });
  check("清空后 data 为 null", afterReset.json?.data === null, afterReset.json);
}

section("⑧ 账号管理");
{
  const exported = await call("GET", "/api/account/export", { token: aliceToken });
  check("导出账号数据 → 200", exported.status === 200 && exported.json?.user?.username === USER_A.username, exported.json);
  check("导出内容含设置", exported.json?.settings?.data?.campusPreference === "west", exported.json?.settings);

  const badChange = await call("POST", "/api/account/password", {
    token: aliceToken,
    body: { currentPassword: "not-the-password", newPassword: "new-password-999" },
  });
  check("改密需正确当前密码 → 401", badChange.status === 401, badChange.json);

  const changed = await call("POST", "/api/account/password", {
    token: aliceToken,
    body: { currentPassword: USER_A.password, newPassword: "new-password-999" },
  });
  check("改密成功 → 200 且返回新 token", changed.status === 200 && typeof changed.json?.token === "string", changed.json);
  const newToken = changed.json?.token;

  const oldToken = await call("GET", "/api/auth/me", { token: aliceToken });
  check("改密后旧 token 全部失效", oldToken.status === 401, oldToken.status);

  const newLogin = await call("POST", "/api/auth/login", {
    body: { username: USER_A.username, password: "new-password-999" },
  });
  check("新密码可登录", newLogin.status === 200, newLogin.json);
  const finalToken = newLogin.json?.token ?? newToken;

  const oldPasswordLogin = await call("POST", "/api/auth/login", {
    body: { username: USER_A.username, password: USER_A.password },
    ip: "198.51.100.77",
  });
  check("旧密码不再可用", oldPasswordLogin.status === 401, oldPasswordLogin.status);

  const logout = await call("POST", "/api/auth/logout", { token: finalToken });
  check("注销 → 204 + 清 Cookie", logout.status === 204 && (logout.headers.get("Set-Cookie") ?? "").includes("Max-Age=0"));
  const afterLogout = await call("GET", "/api/auth/me", { token: finalToken });
  check("注销后 token 失效", afterLogout.status === 401);
}

section("⑨ 注销账号（级联删除）");
{
  const aliceLogin = await call("POST", "/api/auth/login", {
    body: { username: USER_A.username, password: "new-password-999" },
  });
  const token = aliceLogin.json?.token;

  const wrongPassword = await call("DELETE", "/api/account", { token, body: { password: "nope-nope-nope" } });
  check("删号需密码确认 → 401", wrongPassword.status === 401, wrongPassword.json);

  const deleted = await call("DELETE", "/api/account", { token, body: { password: "new-password-999" } });
  check("删号 → 204", deleted.status === 204, deleted.status);

  const goneToken = await call("GET", "/api/settings", { token });
  check("删号后 token 失效", goneToken.status === 401);

  const goneLogin = await call("POST", "/api/auth/login", {
    body: { username: USER_A.username, password: "new-password-999" },
    ip: "198.51.100.88",
  });
  check("删号后无法登录", goneLogin.status === 401);

  const rows = env.DB.prepare("SELECT (SELECT COUNT(*) FROM users WHERE username_lower = 'smoke_alice') AS alice, (SELECT COUNT(*) FROM user_settings) AS settings, (SELECT COUNT(*) FROM user_plans) AS plans").syncAll();
  const counts = rows[0];
  check("alice 用户行已删除", counts.alice === 0, counts);
  check("设置/方案行级联删除", counts.settings === 0 && counts.plans === 0, counts);

  const meta = await call("GET", "/api/meta");
  check("注册开关可配置（当前为 true）", meta.json?.registrationOpen === true);
}

section("⑩ 关闭注册与定时清理");
{
  env.ALLOW_REGISTRATION = "false";
  const blocked = await call("POST", "/api/auth/register", {
    body: { username: "smoke_dave", password: "dave-password-123" },
  });
  check("ALLOW_REGISTRATION=false → 403", blocked.status === 403 && blocked.json?.error?.code === "registration_disabled", blocked.json);
  env.ALLOW_REGISTRATION = "true";

  // 伪造一个过期会话 + 陈旧限流行，验证 scheduled 清理
  const past = Date.now() - 1000;
  env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) SELECT 'expired-hash', id, ?, ?, ? FROM users LIMIT 1")
    .bind(past - 1000, past, past)
    .syncAll();
  env.DB.prepare("INSERT INTO auth_attempts (key, count, window_start, locked_until) VALUES ('stale', 3, ?, NULL)")
    .bind(Date.now() - 40 * 24 * 60 * 60 * 1000)
    .syncAll();

  const ctx = createCtx();
  await worker.scheduled({ scheduledTime: Date.now(), cron: "0 4 * * *" }, env, ctx);
  await ctx.drain();

  const remainingSessions = env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = 'expired-hash'").syncAll()[0].n;
  const remainingAttempts = env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = 'stale'").syncAll()[0].n;
  check("定时任务清理过期会话", remainingSessions === 0, remainingSessions);
  check("定时任务清理陈旧限流行", remainingAttempts === 0, remainingAttempts);
}

// ── 5. 汇总 ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
if (failures.length === 0) {
  console.log(`✅ 全部通过：${passed} 项断言`);
  sqlite.close();
  process.exit(0);
}
console.error(`❌ 失败 ${failures.length} 项 / 共 ${passed + failures.length} 项：`);
for (const name of failures) console.error(`   - ${name}`);
sqlite.close();
process.exit(1);
