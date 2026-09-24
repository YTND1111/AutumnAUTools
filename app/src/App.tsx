import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LegacyPage from "./legacy/LegacyPage";
import { LEGACY_PAGES } from "./legacy/pages";
import HomePage from "./pages/HomePage";
import QbnPage from "./pages/QbnPage";
import CaBetaPage from "./pages/CaBetaPage";
import ResourcesPage from "./pages/ResourcesPage";
import GpaPage from "./pages/GpaPage";
import DeepSeekPage from "./pages/DeepSeekPage";
import ExternalLinkGuard from "./components/ExternalLinkGuard";
import { SettingsContextProvider } from "./settings/SettingsContext";
import { PlansContextProvider } from "./plans/PlansContext";

/**
 * 遗留页面中的站内绝对链接 → React 路由映射。
 * 原站点部署在域名根路径，导航使用 /index.html 等绝对路径；
 * 迁移后由 HashRouter 接管，点击拦截避免整页刷新。
 */
const LEGACY_LINK_ROUTE_MAP: Record<string, string> = {
  "/index.html": "/",
  "/ca.html": "/ca",
  "/qbn.html": "/qbn",
  "/qn.html": "/qbn", // 原 ca.html 侧边栏中的笔误链接，顺手兼容
};

/** 全局点击拦截：把遗留 HTML 内的站内 .html 链接转为路由跳转 */
function LegacyLinkInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // 修饰键/非左键/已阻止的点击保持浏览器默认行为
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
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const route = LEGACY_LINK_ROUTE_MAP[href];
      if (route) {
        event.preventDefault();
        navigate(route);
      }
    };
    // 必须用捕获阶段：遗留 index.js 在侧边栏的冒泡阶段调用了 stopPropagation()，
    // 冒泡阶段的 document 监听收不到侧边栏内的链接点击
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [navigate]);

  return null;
}

/** 整页跳转到 public/ 下的独立静态页（如 cn.html 通知单课表预览） */
function RedirectToStaticPage({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <LegacyLinkInterceptor />
      {/* 站外链接（非同域名）风险提醒：全局拦截外链点击并弹确认框（含 legacy 挂载页） */}
      <ExternalLinkGuard />
      {/* 用户设置全局上下文（SettingsProvider 抽象：当前 localStorage，后端就绪后可换远程实现） */}
      <SettingsContextProvider>
        {/* 配课方案全局上下文（PlanProvider 抽象：预留用户维度，多用户方案上云） */}
        <PlansContextProvider>
          <Routes>
          {/* 首页与题库页已完成原生 React 重写（pages/HomePage.tsx、pages/QbnPage.tsx），不再走遗留挂载 */}
          <Route path="/" element={<HomePage />} />
          {/* 排课表工具：原生重构版已上线（pages/CaBetaPage.tsx，plan/class 双模式与原站对齐） */}
          <Route path="/ca" element={<CaBetaPage />} />
          {/* 旧开发路由重定向到正式路由 */}
          <Route path="/ca-beta" element={<Navigate to="/ca" replace />} />
          {/* 遗留挂载回滚兜底（无入口，仅手动访问；稳定后可删除） */}
          <Route path="/ca-legacy" element={<LegacyPage {...LEGACY_PAGES.ca} />} />
          <Route path="/qbn" element={<QbnPage />} />
          {/* 学习资料下载页（静态清单驱动，见 services/resources.ts 与 scripts/sync-resources.mjs） */}
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/gpa" element={<GpaPage />} />
          <Route path="/deepseek" element={<DeepSeekPage />} />
          <Route path="/cn" element={<RedirectToStaticPage to="/cn.html" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PlansContextProvider>
      </SettingsContextProvider>
    </HashRouter>
  );
}
