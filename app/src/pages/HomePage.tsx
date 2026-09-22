import { useEffect } from "react";
import { Link } from "react-router-dom";
import FloatingChrome from "../components/FloatingChrome";
import ExternalLink from "../components/ExternalLink";
import FunTabs from "../components/FunTabs";
import FeeCalendar from "../components/FeeCalendar";
import AdPopup from "../components/AdPopup";
import { ANNOUNCEMENTS, APP_VERSION_HOME } from "../config";
import "./HomePage.css";

/**
 * HomePage —— 首页（原生 React 重写版，原 index.html 的渐进重构）。
 *
 * 与原页面的对应关系：
 * - 悬浮球/侧边栏框架 → FloatingChrome 组件（与题库页共享）；
 * - 内联 <style> → HomePage.css（统一收敛在 .home-page 作用域；:root 变量与
 *   GlobalStyle.css 完全一致，属冗余定义，已省略）；
 * - 趣味功能选项卡 → FunTabs 组件（绿色光影滑动 + 阴影生长动画原样保留）；
 * - 窝囊费打表日历 → FeeCalendar 组件（useState 驱动，替代手动 innerHTML 重绘）；
 * - 资讯列表由静态重复 HTML 收敛为 NEWS_ITEMS 数据驱动渲染（三个独立 .news-list
 *   包装合并为单个列表，CSS 中间距保持原视觉效果）；
 * - 站内 .html 绝对链接 → <Link>；外部链接 → <ExternalLink>（非同域名外链，
 *   点击时由全局 ExternalLinkGuard 弹出风险提醒；图标类外链关闭「↗」标记），
 *   PDF 下载保持 <a>；
 * - 不再加载 version-global.js（页面内 fetch 均走固定路径，无版本戳用途）。
 */

const SIDEBAR_LINKS = [
  { to: "/", label: "本站首页" },
  { to: "/ca", label: "排课表工具" },
  { to: "/qbn", label: "题库" },
  { to: "/resources", label: "学习资料" },
];

const NEWS_ITEMS = [
  { title: "排课表工具v2.0.1新增外链入口与外链提醒", date: "2026-09-22" },
  { title: "秋功v2.0.0 React 重构上线", date: "2026-08-10" },
  { title: "排课表工具v2.0.0版本更新", date: "2026-08-10" },
  { title: "排课表工具v1.2.3版本更新", date: "2026-07-19" },
  { title: "题库v1.0.0版本更新", date: "2026-07-07" },
  { title: "OJ外包", date: "2026-07-22" },
];

export default function HomePage() {
  useEffect(() => {
    document.title = "秋功-首页";
  }, []);

  return (
    <>
      <FloatingChrome links={SIDEBAR_LINKS} />

      {/* 右下角趣味广告弹窗（白色遮罩闪烁 + X 关闭） */}
      <AdPopup />

      <div className="home-page">
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

        {/* 公告通知（数据来自 config.ts 的 ANNOUNCEMENTS，空数组则不渲染） */}
        {ANNOUNCEMENTS.length > 0 && (
          <div className="announcement-area container">
            {ANNOUNCEMENTS.map((item) => (
              <div className="announcement-bar" key={`${item.date}-${item.title}`}>
                <span className="announcement-badge">公告</span>
                <span className="announcement-title">{item.title}</span>
                <span className="announcement-content">{item.content}</span>
                <span className="announcement-date">{item.date}</span>
              </div>
            ))}
          </div>
        )}

        {/* 主体内容区域 */}
        <div className="main container">
          {/* 左侧资讯列表 */}
          <div className="left-box surface-card">
            <div className="title-bar primary-border">
              <span className="title">最新更新</span>
              <span className="more primary-text">更多 &gt;</span>
            </div>
            <div className="news-list">
              {NEWS_ITEMS.map((item) => (
                <div className="news-item" key={item.title}>
                  <div className="dot primary-bg"></div>
                  <div className="news-title hover-primary">{item.title}</div>
                  <div className="news-date">{item.date}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧快捷入口 */}
          <div className="right-box">
            <div className="dial-title">快捷入口</div>
            <div className="dial-grid">
              <Link to="/ca" className="dial-btn">
                排课表工具
              </Link>
              <Link to="/qbn" className="dial-btn">
                题库
              </Link>
              {/* OJ 入口：胶囊分段式——本地刷题（cpp.html）与外包机考模拟并列 */}
              <div className="dial-btn dial-segmented" role="group" aria-label="OJ 刷题入口">
                <a href="/cpp.html" className="dial-segment">
                  <span className="dial-segment-title">本地刷题</span>
                  <span className="dial-segment-sub">C++ 在线判题</span>
                </a>
                {/* 机考模拟为第三方外链（不同域名），点击前会弹出外链风险提醒 */}
                <ExternalLink
                  href="http://vm.cau.edu.cn/s2025321070110/oj/index.jsp"
                  className="dial-segment"
                  showIcon={false}
                >
                  <span className="dial-segment-title">机考模拟</span>
                  <span className="dial-segment-sub">由@计算姬珂学家 提供</span>
                </ExternalLink>
              </div>
              <a href="/src/py/中国农业大学本科生培养方案.pdf" download className="dial-btn">
                培养方案（2023版）
              </a>
            </div>

            {/* 趣味功能区（选项卡） */}
            <div className="fun-section">
              <div className="dial-title">趣味功能</div>
              <FunTabs
                panels={[
                  {
                    id: "FunPanelEat",
                    label: "今天吃什么",
                    content: (
                      <p>
                        暑假期间只能吃公三、研一、研二、民族风味食堂
                        <br />
                        <br />
                        无推荐
                      </p>
                    ),
                  },
                  {
                    id: "FunPanelFee",
                    label: "窝囊费打表",
                    content: (
                      <>
                        <FeeCalendar />
                        <br />
                        <span className="text-muted">仅供参考</span>
                      </>
                    ),
                  },
                  {
                    id: "FunPanelTips",
                    label: "农大tips",
                    content: "内容建设中，敬请期待……",
                  },
                ]}
              />
            </div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="footer primary-bg text-white text-center">
          <div className="container">
            <p className="home-version">秋功 v{APP_VERSION_HOME}</p>
            <p>
              <ExternalLink href="https://github.com/YTND1111/AutumnAUTools">秋功</ExternalLink>
              -本项目采用{" "}
              <ExternalLink href="http://www.apache.org/licenses/LICENSE-2.0">
                [Apache License 2.0](LICENSE) 开源许可证
              </ExternalLink>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
