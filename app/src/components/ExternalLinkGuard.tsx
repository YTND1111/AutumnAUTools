import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ExternalLinkGuard.css";

/**
 * ExternalLinkGuard —— 全站「站外链接（非同域名外链）风险提醒」。
 *
 * 挂载于 App 顶层（见 App.tsx），在 document 捕获阶段统一拦截所有
 * `<a href>` 点击：只要目标地址与当前站点**既非同源、也非同一 host**，
 * 就先阻止默认跳转并弹出风险提醒，用户确认后才按原锚点语义跳转。
 *
 * 为什么要做成全局拦截而不是只包一层组件：
 * - 站外链接不只出现在 React 页面（首页 OJ 入口/页脚、广告弹窗、排课表外链按钮），
 *   legacy 挂载页里也可能有普通 `<a>` 外链，全局拦截能一次性覆盖；
 * - 提醒逻辑单一实现，避免每个外链各自弹窗，也避免同一链接弹两次。
 * 新写外链仍建议使用 components/ExternalLink（统一 target/rel 与「↗」标记）。
 *
 * 拦截范围与豁免（判定顺序见 getExternalHref）：
 * - 仅拦截 http/https 且 host 与当前站点不同的链接；
 * - 同源/同 host 站内链接、`#hash`、`mailto:`/`tel:` 等协议、带 `download`
 *   属性的下载链接一律放行；
 * - 按住修饰键（Ctrl/Cmd/Shift/Alt）或中键点击时**不拦截**：这类操作是用户
 *   明确要求新标签页/后台打开，沿用浏览器默认行为（与站内
 *   LegacyLinkInterceptor 的约定一致）；
 * - 锚点带 `data-external-ignore` 时视为受信任外链，跳过提醒（留作白名单口子）。
 *
 * 提醒强度：默认每次都提醒；弹窗内勾选「本次会话不再提醒」后，仅在
 * sessionStorage（当前标签页会话）内静默放行，关闭标签页即恢复提醒。
 */

/** 会话级「已知晓外链风险」标记（sessionStorage：仅当前标签页会话生效） */
const SESSION_ACK_KEY = "autumn-external-link-ack";

interface PendingLink {
  /** 目标完整地址 */
  url: string;
  /** 目标主机（含端口），用于醒目展示域名 */
  host: string;
  /** 是否沿用原锚点的 target="_blank" 语义（新窗口打开） */
  newTab: boolean;
}

/** 读取会话级免提醒标记（localStorage/sessionStorage 不可用时按“未确认”处理） */
function isSessionAcked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 判定锚点是否为需要提醒的站外链接；返回目标地址，非外链返回 null。
 */
function getExternalHref(anchor: HTMLAnchorElement): string | null {
  // 显式白名单：已知可信外链可加 data-external-ignore 跳过提醒
  if (anchor.dataset.externalIgnore !== undefined) return null;
  // 下载类链接不跳转页面，无离开本站的风险
  if (anchor.hasAttribute("download")) return null;

  const raw = anchor.getAttribute("href");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  // mailto: / tel: / javascript: 等非网页协议不处理
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // 同 host（含端口）= 本站链接；开发环境 localhost 与 127.0.0.1 视为不同域，同样提醒
  if (url.host === window.location.host) return null;
  return url.href;
}

export default function ExternalLinkGuard() {
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [dontRemind, setDontRemind] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // 捕获阶段全局拦截：React 页面与 legacy 挂载页的外链一并覆盖
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // 修饰键/非左键点击 = 用户明确要求新标签页/后台打开，放行浏览器默认行为
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = getExternalHref(anchor);
      if (!href) return;
      // 会话内已确认风险：不再打断，交由浏览器默认行为跳转
      if (isSessionAcked()) return;

      event.preventDefault();
      setDontRemind(false);
      setPending({
        url: href,
        host: new URL(href).host,
        newTab: anchor.getAttribute("target") === "_blank",
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // 弹窗打开时：Esc 取消 + 焦点落在「取消」上（风险确认默认不鼓励继续）
  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPending(null);
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [pending]);

  if (!pending) return null;

  const handleConfirm = () => {
    if (dontRemind) {
      try {
        sessionStorage.setItem(SESSION_ACK_KEY, "1");
      } catch {
        /* 忽略 sessionStorage 不可用 */
      }
    }
    const link = pending;
    setPending(null);
    setDontRemind(false);
    if (link.newTab) {
      window.open(link.url, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(link.url);
    }
  };

  return createPortal(
    <div
      className="extlink-overlay"
      // 点击遮罩空白处 = 取消（避免误触跳转）
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setPending(null);
      }}
    >
      <div
        className="extlink-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="extlink-title"
        aria-describedby="extlink-desc"
      >
        <div className="extlink-head">
          <h2 className="extlink-title" id="extlink-title">
            ⚠ 外链风险提醒
          </h2>
          <button
            type="button"
            className="extlink-close"
            onClick={() => setPending(null)}
            aria-label="关闭外链风险提醒"
            title="关闭"
          >
            ×
          </button>
        </div>

        <p className="extlink-lead" id="extlink-desc">
          你即将离开本站，前往一个<strong>不由本站提供的第三方网站</strong>。
          {pending.newTab ? "确认后将在新窗口打开。" : "确认后当前页面将跳转离开。"}
        </p>

        <div className="extlink-url-box">
          <span className="extlink-host">{pending.host}</span>
          <span className="extlink-url">{pending.url}</span>
        </div>

        <ul className="extlink-risk-list">
          <li>该域名与本站不同，内容由第三方提供，本站无法保证其安全、准确与长期可用。</li>
          <li>请勿在陌生页面输入校园账号密码、验证码、身份证号或支付信息，谨防钓鱼与诈骗。</li>
          <li>若页面要求下载安装文件或授予权限，请先确认来源可信；离开本站后请自行承担风险。</li>
        </ul>

        <label className="extlink-ack">
          <input
            type="checkbox"
            checked={dontRemind}
            onChange={(event) => setDontRemind(event.target.checked)}
          />
          <span>本次会话不再提醒（仅当前标签页有效，关闭标签页后恢复提醒）</span>
        </label>

        <div className="extlink-actions">
          <button type="button" className="extlink-btn" ref={cancelRef} onClick={() => setPending(null)}>
            取消，留在本站
          </button>
          <button type="button" className="extlink-btn is-confirm" onClick={handleConfirm}>
            我已知晓，继续访问
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
