/**
 * 课程通知单数据按需加载（带模块级缓存）。
 *
 * useCourseData 是「进入页面即加载」的 Hook（排课表页需要），而绩点页平时用不到
 * 1.9 MB 的课程数据——只有点「从排课表导入」时才需要按课程编号查学分。
 * 因此单独提供这个惰性加载器：首次调用才 fetch，之后复用同一个 Promise。
 *
 * 语义与 useCourseData 一致：`COURSE_DATA_PATH?v=COURSE_DATA_VERSION`，
 * 失败时清空缓存以便重试。
 */

import { COURSE_DATA_PATH, COURSE_DATA_VERSION } from "../config";
import type { CourseRecord } from "./courseData";

let cache: Promise<CourseRecord[]> | null = null;

export function loadCourseRecords(): Promise<CourseRecord[]> {
  if (!cache) {
    cache = fetch(`${COURSE_DATA_PATH}?v=${COURSE_DATA_VERSION}`)
      .then((res) => {
        if (!res.ok) throw new Error(`课程数据加载失败: ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => (Array.isArray(data) ? (data as CourseRecord[]) : []))
      .catch((err: unknown) => {
        cache = null;
        throw err;
      });
  }
  return cache;
}
