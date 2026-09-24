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
export const APP_VERSION_CA = "2.0.1";

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

/** 本科生院：成绩单 GPA 计算与课程计入规则。 */
export const CAU_GPA_RULES_URL = "https://jwc.cau.edu.cn/art/2026/7/16/art_41139_1122721.html";

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
