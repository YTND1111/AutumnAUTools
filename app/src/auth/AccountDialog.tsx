import { useEffect } from "react";
import { createPortal } from "react-dom";
import AccountPanel from "./AccountPanel";
import "./AccountPanel.css";

/**
 * 账号弹窗（首页导航栏「登录 / 注册」入口使用）。
 *
 * 排课表页不弹窗，直接把 AccountPanel 内联在「用户设置」卡片里；
 * 两处共用同一面板组件，状态由 AuthContext 统一维护。
 */
export default function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="account-modal-mask" role="presentation" onClick={onClose}>
      <div
        className="account-modal"
        role="dialog"
        aria-modal="true"
        aria-label="账号与云端同步"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-modal-head">
          <span>账号与云端同步</span>
          <button type="button" className="account-modal-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <AccountPanel />
      </div>
    </div>,
    document.body,
  );
}
