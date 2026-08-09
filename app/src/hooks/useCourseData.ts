import { useEffect, useState } from "react";
import type { CourseRecord } from "../services/courseData";
import { COURSE_DATA_PATH, COURSE_DATA_VERSION } from "../config";

/**
 * useCourseData —— 课程数据加载 Hook。
 *
 * 对应原 CourseArrangement.js 的 loadCourseData：
 * 从 COURSE_DATA_PATH 拉取通知单课表 JSON（附带版本戳破坏缓存）。
 * 同一页面内多个组件需要数据时，应在页面级调用一次并通过 props/Context 下发。
 *
 * 接入后端后可替换为按查询条件请求（如 /api/courses?keyword=），
 * 检索函数（services/courseData.ts）不受影响。
 */
export interface CourseDataState {
  courses: CourseRecord[];
  /** 首次加载中 */
  loading: boolean;
  /** 加载失败信息（成功为 null） */
  error: string | null;
}

export function useCourseData(): CourseDataState {
  const [state, setState] = useState<CourseDataState>({
    courses: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const dataUrl = `${COURSE_DATA_PATH}?v=${COURSE_DATA_VERSION}`;

    fetch(dataUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`课程数据加载失败: ${res.status}`);
        }
        return res.json();
      })
      .then((data: unknown) => {
        if (!cancelled) {
          setState({
            courses: Array.isArray(data) ? (data as CourseRecord[]) : [],
            loading: false,
            error: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error("[课程数据] 加载失败", err);
          setState({
            courses: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
