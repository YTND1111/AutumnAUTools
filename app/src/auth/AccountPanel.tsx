import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { deleteAccountRequest, exportAccountRequest } from "./api";
import "./AccountPanel.css";

/**
 * 账号面板 —— 首页（弹窗内）与排课表页「用户设置」卡片共用。
 *
 * 未登录：用户名 + 密码（可选邮箱）→ 登录 / 注册，注册成功即登录并开始云端同步；
 * 已登录：展示账号与同步状态，提供「导出云端数据」「注销账号」「退出登录」。
 *
 * 交互细节：
 * - 登录/注册共用一套表单，切换 tab 时清空错误提示；
 * - 后端关闭注册时（ALLOW_REGISTRATION=false）禁用注册 tab；
 * - 注销账号需再次输入密码（后端同样会校验），并二次确认。
 */

type Mode = "login" | "register";

export default function AccountPanel() {
  const { enabled, user, ready, busy, error, meta, login, register, logout, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const passwordMin = meta?.limits.passwordMin ?? 8;
  const registrationOpen = meta?.registrationOpen ?? true;

  if (!enabled) {
    return (
      <div className="account-panel">
        <p className="account-hint">
          本站当前为纯本地模式（未配置云端后端地址），数据仅保存在本机浏览器中。
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="account-panel">
        <p className="account-hint">正在检查登录状态…</p>
      </div>
    );
  }

  // ── 已登录 ────────────────────────────────────────────────────────────────
  if (user) {
    const displayName = user.displayName ?? user.username;

    const onExport = async () => {
      setNotice("");
      try {
        const data = await exportAccountRequest();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `autumn-account-${user.username}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setNotice("已导出云端数据（JSON）。");
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "导出失败，请稍后重试。");
      }
    };

    const onDelete = async () => {
      setNotice("");
      try {
        await deleteAccountRequest(deletePassword);
        setDeletePassword("");
        setDeleteOpen(false);
        // 后端已删除全部数据与会话，这里只需清掉本地登录态
        await logout();
        setNotice("账号已注销，云端数据已全部删除。");
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "注销失败，请稍后重试。");
      }
    };

    return (
      <div className="account-panel">
        <div className="account-user">
          <span className="account-avatar" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="account-user-text">
            <div className="account-name">{displayName}</div>
            <div className="account-sub">@{user.username} · 云端同步已开启</div>
          </div>
        </div>

        <div className="account-actions">
          <button type="button" className="account-btn" onClick={() => void onExport()}>
            导出云端数据
          </button>
          <button
            type="button"
            className="account-btn"
            onClick={() => {
              setDeleteOpen((open) => !open);
              setNotice("");
            }}
          >
            {deleteOpen ? "取消注销" : "注销账号"}
          </button>
          <button type="button" className="account-btn account-btn-primary" onClick={() => void logout()}>
            退出登录
          </button>
        </div>

        {deleteOpen && (
          <div className="account-danger">
            <p className="account-danger-text">
              注销后账号与云端设置、方案将<span className="account-danger-strong">永久删除且无法恢复</span>
              （本机数据不受影响）。请输入密码确认：
            </p>
            <input
              className="account-input"
              type="password"
              value={deletePassword}
              autoComplete="current-password"
              placeholder="当前密码"
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <button
              type="button"
              className="account-btn account-btn-danger"
              disabled={busy || deletePassword.length === 0}
              onClick={() => void onDelete()}
            >
              确认永久注销
            </button>
          </div>
        )}

        {notice && <p className="account-notice">{notice}</p>}
        <p className="account-foot">同一账号在多台设备登录时，以最后一次修改的数据为准。</p>
      </div>
    );
  }

  // ── 未登录 ────────────────────────────────────────────────────────────────
  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice("");
    clearError();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    const ok =
      mode === "login"
        ? await login(username, password)
        : await register(username, password, email || undefined);
    if (ok) {
      setPassword("");
      setEmail("");
      setNotice(mode === "login" ? "登录成功，云端同步已开启。" : "注册成功，云端同步已开启。");
    }
  };

  return (
    <div className="account-panel">
      <p className="account-hint">
        登录后，候选课程、班级课表调用、阻塞时段与偏好设置会同步到云端，换设备登录即可继续排课。
      </p>

      <div className="account-tabs" role="tablist" aria-label="登录或注册">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`account-tab${mode === "login" ? " is-active" : ""}`}
          onClick={() => switchMode("login")}
        >
          登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`account-tab${mode === "register" ? " is-active" : ""}`}
          disabled={!registrationOpen}
          title={registrationOpen ? undefined : "本站已关闭注册"}
          onClick={() => switchMode("register")}
        >
          注册
        </button>
      </div>

      <form className="account-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="account-field">
          <span className="account-label">用户名</span>
          <input
            className="account-input"
            value={username}
            autoComplete="username"
            placeholder="3~32 位字母 / 数字 / 下划线 / 汉字"
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        {mode === "register" && (
          <label className="account-field">
            <span className="account-label">邮箱（可选）</span>
            <input
              className="account-input"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="仅用于日后找回账号"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        )}

        <label className="account-field">
          <span className="account-label">密码</span>
          <input
            className="account-input"
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={`至少 ${passwordMin} 位`}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="account-notice">{notice}</p>}

        <button
          type="submit"
          className="account-btn account-btn-primary account-submit"
          disabled={busy || username.trim().length === 0 || password.length === 0}
        >
          {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
        </button>
      </form>

      {!registrationOpen && <p className="account-foot">本站已关闭注册，仅支持已有账号登录。</p>}
      <p className="account-foot">未登录时数据仍保存在本机浏览器；登录后以云端数据为准。</p>
    </div>
  );
}
