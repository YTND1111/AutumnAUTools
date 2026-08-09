import { useRef } from "react";
import { Link } from "react-router-dom";
import { useFloatingBall } from "../hooks/useFloatingBall";

/**
 * FloatingChrome —— 悬浮球 + 遮罩 + 侧边栏的共享框架组件（原生 React 版）。
 *
 * 由原各页面 body 开头的公共 HTML 片段抽取而来：
 * - 悬浮球/遮罩/侧边栏的 class 与 id 保持原样，样式继续由
 *   public/css/GlobalStyle.css 提供（含三横线 → X 的 is-expanded 动画）；
 * - 拖拽/吸附/开关行为由 useFloatingBall Hook 驱动（js/index.js 的 React 移植）；
 * - 侧边栏链接使用 react-router 的 <Link>，SPA 内无整页刷新；
 * - 原遗留 HTML 中的无效 <scan> 标签与重复 id="Tool" 已清理，
 *   链接块统一使用 .nav-cell 类（GlobalStyle.css 中与原 ID 选择器并列声明）。
 */

export interface SidebarLink {
  /** 站内路由路径（如 "/"、" /ca"、"/qbn"） */
  to: string;
  label: string;
}

export default function FloatingChrome({ links }: { links: SidebarLink[] }) {
  const ballRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { closeSidebar } = useFloatingBall(ballRef, backdropRef, sidebarRef);

  return (
    <>
      <div id="floatingBall" tabIndex={0} ref={ballRef}>
        <span className="fb-bar"></span>
      </div>
      <div id="PageBackdrop" ref={backdropRef}></div>
      <div id="NavSidebar" className="ca-gradient-surface" ref={sidebarRef}>
        {links.map((link, index) => (
          <div key={link.to}>
            <div className="nav-cell">
              {/* 导航后主动收起侧边栏（原站依赖整页刷新自然复位） */}
              <Link to={link.to} className="href" onClick={closeSidebar}>
                {link.label}
              </Link>
            </div>
            {index < links.length - 1 && <br />}
          </div>
        ))}
        <br />
        {/* 预留区块：与原站一致的空占位（#News 有 88px 占位样式） */}
        <div id="News"></div>
        <div id="OtherLink"></div>
      </div>
    </>
  );
}
