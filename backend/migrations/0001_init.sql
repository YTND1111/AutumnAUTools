-- 秋功用户后端 —— 初始表结构（Cloudflare D1 / SQLite）
--
-- 应用方式：
--   本地：wrangler d1 migrations apply autumn-autools --local
--   远程：wrangler d1 migrations apply autumn-autools --remote
--
-- 约定：
--   * 所有时间戳为 **毫秒级 Unix 时间**（INTEGER，与前端 Date.now() 对齐）；
--   * 用户名/邮箱保存「原样 + 归一化小写」两列，唯一约束建在归一化列上，
--     避免大小写不同产生重复账号；
--   * 密码哈希格式：pbkdf2-sha256$<迭代次数>$<salt-b64url>$<hash-b64url>
--     （见 src/crypto.ts，可平滑升级迭代次数）；
--   * 设置/方案以 JSON 文本整块存储，reading/writing 走 revision 乐观锁。

-- ── 用户 ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT    PRIMARY KEY,              -- uuid v4
  username       TEXT    NOT NULL,                 -- 原样展示
  username_lower TEXT    NOT NULL UNIQUE,          -- 归一化（小写）登录键
  display_name   TEXT,
  email          TEXT,
  email_lower    TEXT    UNIQUE,                   -- 可空；SQLite 允许多个 NULL
  password_hash  TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  last_login_at  INTEGER
);

-- ── 会话（不透明 token，服务端只存 SHA-256，泄露也无法反推） ────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent   TEXT,
  ip           TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ── 用户设置（与前端 app/src/settings 一一对应） ────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id    TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,                     -- JSON 快照
  revision   INTEGER NOT NULL DEFAULT 0,           -- 乐观锁版本号
  updated_at INTEGER NOT NULL
);

-- ── 配课方案（与前端 app/src/plans 一一对应，多用户方案上云） ───────────────
CREATE TABLE IF NOT EXISTS user_plans (
  user_id    TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- ── 登录/注册限流（防爆破；按 ip+用户名 维度计数） ──────────────────────────
CREATE TABLE IF NOT EXISTS auth_attempts (
  key          TEXT    PRIMARY KEY,                -- 如 login:1.2.3.4:alice
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
);
