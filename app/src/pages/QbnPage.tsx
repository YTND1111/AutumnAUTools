import { useEffect } from "react";
import { Link } from "react-router-dom";
import FloatingChrome from "../components/FloatingChrome";
import "./QbnPage.css";

/**
 * QbnPage —— 题库首页（原生 React 重写版，原 qbn.html 的渐进重构范例）。
 *
 * 与原页面的对应关系：
 * - 悬浮球/侧边栏框架 → FloatingChrome 组件（useFloatingBall Hook 驱动）；
 * - 页面结构/文案原样保留，内联 <style> → QbnPage.css（统一收敛在 .qbn-page 作用域）；
 * - /index.html、/qbn.html 绝对链接 → react-router <Link>（SPA 内无整页刷新）；
 * - ./questionBank/sz/*.html 答题页仍为独立静态页，保持 <a> 整页打开；
 * - "待补充"占位按钮原为 href="#"（HashRouter 下 "#" 会误触路由），改为 button；
 * - 不再加载 version-qbn.js / version-global.js（本页无任何 fetch，版本常量无用途）。
 */

const SIDEBAR_LINKS = [
  { to: "/", label: "本站首页" },
  { to: "/ca", label: "排课表工具" },
  { to: "/qbn", label: "题库" },
  { to: "/resources", label: "学习资料" },
];

export default function QbnPage() {
  useEffect(() => {
    document.title = "秋功-题库";
  }, []);

  return (
    <>
      <FloatingChrome links={SIDEBAR_LINKS} />

      <div className="qbn-page">
        {/* 顶部导航栏 */}
        <div className="header primary-bg">
          <div className="container">
            <div className="logo">秋功-农大工具站</div>
            <div className="nav-list">
              <div className="nav-item">
                <Link to="/">首页</Link>
              </div>
              <div className="nav-item">
                <Link to="/qbn">题库</Link>
              </div>
              <div className="nav-item">
                <Link to="/resources">学习资料</Link>
              </div>
              <div className="nav-item">联系作者</div>
            </div>
          </div>
        </div>

        {/* 主体内容区域 */}
        <div className="main container">
          {/* 左侧快捷入口：可复制粘贴 .dial-group 单元块向下堆叠 */}
          <div className="right-box">
            <div className="dial-group">
              <div className="dial-title">思政类</div>
              <div className="dial-grid">
                {/* 答题页为独立静态页，整页打开 */}
                <a href="/questionBank/sz/xgxz.html" className="dial-btn">
                  习思想选择题
                </a>
              </div>
              <div className="dial-grid">
                <a href="/questionBank/sz/myxz.html" className="dial-btn">
                  <div>
                    马原选择题
                    <br />
                    <p style={{ fontSize: "small" }}>由@计算姬珂学家 提供</p>
                  </div>
                </a>
              </div>
            </div>

            <div className="dial-group">
              <div className="dial-title">工院</div>
              <div className="dial-grid">
                <button type="button" className="dial-btn">
                  待补充
                </button>
              </div>
            </div>
          </div>

          {/* 右侧目录 */}
          <div className="left-box surface-card">
            <div className="title-bar">
              <span className="title">目录</span>
            </div>
            <p className="intro">待补充</p>
          </div>
        </div>

        {/* 页脚 */}
        <div className="footer primary-bg text-white text-center">
          <div className="container">
            <p>秋功</p>
          </div>
        </div>
      </div>
    </>
  );
}
