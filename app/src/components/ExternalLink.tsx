import type { AnchorHTMLAttributes, ReactNode } from "react";
import "./ExternalLink.css";

/**
 * ExternalLink —— 站外链接（非同域名）统一锚点组件。
 *
 * 约定：
 * - 统一使用 target="_blank" + rel="noopener noreferrer nofollow"，
 *   避免第三方页面通过 window.opener 反向控制本站，也避免搜索引擎把外链
 *   当作本站推荐（本站不对第三方内容背书）；
 * - 默认在文字后追加「↗」外链标记（showIcon={false} 可关闭，用于图标类外链）；
 * - **点击时的风险提醒不在此组件内实现**：由全局 ExternalLinkGuard
 *   （见 components/ExternalLinkGuard.tsx）在 document 捕获阶段统一拦截并弹窗，
 *   这样 React 页面与 legacy 挂载页里的普通 <a> 外链也能被同一套提醒覆盖，
 *   同时避免同一链接弹出两个确认框。
 *
 * 用法：
 *   <ExternalLink href={URL}>CAU选课助手</ExternalLink>
 *   <ExternalLink href={URL} className="dial-segment" showIcon={false}>…</ExternalLink>
 */
export interface ExternalLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> {
  /** 目标地址（必须为 http/https 绝对地址；不用于站内链接） */
  href: string;
  /** 链接文本/内容 */
  children: ReactNode;
  /** 是否在内容后追加「↗」外链标记，默认 true */
  showIcon?: boolean;
}

export default function ExternalLink({
  href,
  children,
  showIcon = true,
  className,
  title,
  ...rest
}: ExternalLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className ? `ext-link ${className}` : "ext-link"}
      title={title ?? `外部链接，将在新窗口打开：${href}`}
    >
      {children}
      {showIcon && (
        <span className="ext-link-icon" aria-hidden="true">
          ↗
        </span>
      )}
    </a>
  );
}
