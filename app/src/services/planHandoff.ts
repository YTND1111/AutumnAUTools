/**
 * 排课表 → 绩点计算 的一次性交接（sessionStorage）。
 *
 * 用途：在排课表页选定方案后点「导入到绩点规划」，把当前课表的课程（名称/学分/编号）
 * 放到当前标签页的 sessionStorage，再跳转 /gpa；目标 GPA 规划面板挂载时读取并**立即清除**，
 * 因此刷新或新开标签页不会重复导入。用 sessionStorage 而非 URL 参数，避免几十门课时
 * URL 过长，也避免课程名里的特殊字符编码问题。
 */

import type { GoalCourseCandidate } from "./goalCourses";

export const PLAN_HANDOFF_KEY = "autumn-plan-handoff";

export interface PlanHandoffPayload {
  courses: GoalCourseCandidate[];
  /** 因通知单里查不到学分而未带入的课程数 */
  missing?: number;
  /** 生成时间戳（便于排查） */
  createdAt: number;
}

export function setPlanHandoff(courses: GoalCourseCandidate[], missing = 0): void {
  try {
    const payload: PlanHandoffPayload = { courses, missing, createdAt: Date.now() };
    sessionStorage.setItem(PLAN_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage 不可用（隐私模式）时静默失败：用户仍可在绩点页手动添加 */
  }
}

/** 读取并清除交接数据（只在跳转后的首次挂载调用一次） */
export function takePlanHandoff(): PlanHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(PLAN_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PLAN_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as Partial<PlanHandoffPayload>;
    if (!parsed || !Array.isArray(parsed.courses)) return null;
    const courses = parsed.courses
      .filter((course): course is GoalCourseCandidate => !!course && typeof course.name === "string")
      .map((course) => ({
        name: course.name.trim().slice(0, 40),
        credits: Math.round(Number(course.credits) * 10) / 10,
        code: typeof course.code === "string" ? course.code.trim().slice(0, 20) : "",
      }))
      .filter((course) => course.name && Number.isFinite(course.credits) && course.credits > 0);
    if (!courses.length) return null;
    return { courses, missing: Number(parsed.missing) || 0, createdAt: Number(parsed.createdAt) || 0 };
  } catch {
    return null;
  }
}
