import type { LegacyPageDef } from "./LegacyPage";

/**
 * 遗留页面清单：与原静态站点一一对应。
 * 脚本顺序与原 HTML 中 <script> 标签顺序完全一致。
 *
 * 说明：
 * - 首页（home）与题库页（qbn）已完成原生 React 重写，路由分别由
 *   pages/HomePage.tsx、pages/QbnPage.tsx 接管，不再出现在本清单中
 *   （public/legacy/home.html、qbn.html 为提取脚本产物，保留但不再使用）；
 * - cn.html（通知单课表预览）为独立静态页（CDN 引入 Univer Sheets），
 *   保持 public/cn.html 原样，由悬浮窗 iframe 或 /cn 路由整页打开；
 * - questionBank/ 下答题页、floatingball-demo.html 同为独立静态页，无需挂载。
 */
export const LEGACY_PAGES = {
  ca: {
    title: "秋功-排课表工具",
    htmlUrl: "/legacy/ca.html",
    globalScripts: ["/js/version-ca.js"],
    pageScripts: [
      "/js/FloatingWindow.js",
      "/js/CourseArrangement.js",
      "/js/index.js",
      "/legacy/ca-inline.js",
    ],
  },
} satisfies Record<string, LegacyPageDef>;
