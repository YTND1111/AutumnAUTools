/**
 * 应用级常量配置。
 */

/**
 * 课程数据 JSON 路径（public/src/py/ 下，与原静态站点保持一致）。
 * 文件名为每学期通知单课表名，学期切换时需与原站同步更新。
 */
export const COURSE_DATA_PATH = "/src/py/中国农业大学2026-2027学年秋季学期通知单课表.json";

/**
 * 课程数据缓存破坏版本戳。
 * 与仓库根目录 version-ca.json 保持同步（原站由 js/version-ca.js 提供，
 * 原生 React 代码不加载该脚本，故在此显式声明）。
 */
export const COURSE_DATA_VERSION = "1.2.3";
