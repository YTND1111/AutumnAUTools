/**
 * 应用级常量配置（版本号单一事实来源）。
 *
 * 版本管理约定（React 迁移后替代旧站 version-*.json + bump 脚本）：
 * - 首页 / 排课表工具版本号在此修改后随下次构建生效，页面自动展示；
 * - Vite 产物自带内容指纹（assets/index-<hash>.js|css），业务代码无需手动版本戳；
 * - 课程数据 JSON 属 public/ 原样静态资源，仍用 COURSE_DATA_VERSION 做缓存破坏，
 *   已派生自排课表工具版本号，无需单独维护。
 */

/** 首页（全局框架）版本号，展示于首页页脚 */
export const APP_VERSION_HOME = "2.0.0";

/** 排课表工具版本号，展示于排课表页顶栏右上角 */
export const APP_VERSION_CA = "2.0.3";

/** 绩点计算工具版本号，展示于绩点计算页页脚 */
export const APP_VERSION_GPA = "1.3.0";

/**
 * 课程数据 JSON 路径（public/src/py/ 下，与原静态站点保持一致）。
 * 文件名为每学期通知单课表名，学期切换时需与原站同步更新。
 */
export const COURSE_DATA_PATH = "/src/py/中国农业大学2026-2027学年秋季学期通知单课表.json";

/**
 * 课程数据缓存破坏版本戳（fetch 时以 ?v= 附加）。
 * 派生自排课表工具版本号：排课表发版即刷新课程数据缓存。
 */
export const COURSE_DATA_VERSION = APP_VERSION_CA;

/**
 * 站外链接（非同域名外链）清单。
 *
 * 约定：所有指向第三方网站、与本站不同域名的外链集中登记在此，页面用
 * components/ExternalLink 渲染（统一 target/rel 与「↗」标记）。
 * 任何非同域名外链在点击时都会被 components/ExternalLinkGuard 拦截并弹出
 * 风险提醒；如需放行某个已确认可信的外链，在锚点上加 `data-external-ignore`。
 */

/** CAU 选课助手（第三方站点，CAU 排课/选课辅助工具） */
export const CAU_COURSE_ASSISTANT_URL =
  "https://4m0wx6v13h11a.aiforce.cloud/app/app_17duqfz189b";

/** 首页公告条目 */
export interface Announcement {
  date: string;
  title: string;
  content: string;
}

/**
 * 首页公告列表（仅在首页展示；空数组 = 不渲染公告区）。
 * 新公告加在数组开头。
 */
export const ANNOUNCEMENTS: Announcement[] = [
  {
    date: "2026-09-22",
    title: "排课表工具 v2.0.1：新增 CAU选课助手友链",
    content:
      "",
  },
  {
    date: "2026-08-10",
    title: "秋功 v2.0.0 全新上线",
    content:
      "本站已迁移至 React 框架：首页与排课表工具全面重构（排课表工具同步升级 v2.0.0），界面与功能与原站保持一致。如遇显示异常，请刷新页面。",
  },
];

/**
 * ── 用户后端（Cloudflare Workers + D1）接入配置 ──────────────────────────────
 *
 * 后端代码与部署说明见仓库根目录的 backend/ 与 docs/user-backend.md。
 *
 * BACKEND_BASE_URL 取值：
 *   * 留空（默认）→ 使用同源 `/api`：
 *       - 本地开发：vite.config.ts 已把 /api 代理到 wrangler dev（127.0.0.1:8787）；
 *       - 生产环境：静态站点与 Worker 同域（如 Cloudflare Pages + Workers 路由同一域名）。
 *   * 跨域部署（静态站与 Worker 不同域名）→ 在 app/.env.local 填 Worker 地址，例如
 *       VITE_BACKEND_BASE_URL=https://autumn-autools-api.<你的子域>.workers.dev
 *     并把该静态站来源加入 backend/wrangler.toml 的 ALLOWED_ORIGINS。
 */
export const BACKEND_BASE_URL: string = (
  (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? ""
).replace(/\/+$/, "");

/**
 * 云端后端总开关（构建期）。设为 "false" 时：
 *   - 不发起任何 /api 请求，账号入口显示为「未启用」；
 *   - 设置与方案回退为纯 localStorage 单机模式（与接入后端前的行为完全一致）。
 */
export const BACKEND_ENABLED: boolean =
  ((import.meta.env.VITE_BACKEND_ENABLED as string | undefined) ?? "true").toLowerCase() !== "false";
