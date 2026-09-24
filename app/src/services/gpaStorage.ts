import { EXAMPLE_BANDS } from "./gpa.ts";
import type { GpaCourse, GradeMode } from "./gpa.ts";

export const GPA_STORAGE_KEY = "autumn-gpa-v1";
export interface GpaState {
  version: 1;
  courses: GpaCourse[];
  mode: GradeMode;
  scale: string;
  bands: string;
  baseline: "courses" | "summary";
  currentCredits: string;
  currentGpa: string;
  remainingCredits: string;
  targetGpa: string;
  regularScore: string;
  examWeight: string;
  targetScore: string;
}

export function blankCourse(): GpaCourse {
  return { id: crypto.randomUUID(), name: "", code: "", credits: "", grade: "", score: "", included: true };
}

export function defaultGpaState(): GpaState {
  return {
    version: 1, courses: [blankCourse()], mode: "points", scale: "4", bands: EXAMPLE_BANDS,
    baseline: "courses", currentCredits: "", currentGpa: "", remainingCredits: "", targetGpa: "",
    regularScore: "", examWeight: "60", targetScore: "",
  };
}

/** 本机缓存也需要校验，损坏的记录不能让页面白屏。 */
export function restoreGpaState(raw: string): GpaState | null {
  try {
    const value = JSON.parse(raw) as GpaState;
    if (!value || value.version !== 1 || !["points", "percent"].includes(value.mode) ||
      !["courses", "summary"].includes(value.baseline) || !Array.isArray(value.courses) || value.courses.length > 200) return null;
    const fields = ["scale", "bands", "currentCredits", "currentGpa", "remainingCredits", "targetGpa", "regularScore", "examWeight", "targetScore"] as const;
    if (fields.some((key) => typeof value[key] !== "string" || value[key].length > 2000)) return null;
    const ids = new Set<string>();
    for (const course of value.courses) {
      if (!course || typeof course.included !== "boolean" ||
        ["id", "name", "code", "credits", "grade", "score"].some((key) => typeof course[key as keyof GpaCourse] !== "string" || String(course[key as keyof GpaCourse]).length > 200) ||
        !course.id || ids.has(course.id)) return null;
      ids.add(course.id);
    }
    return value;
  } catch { return null; }
}
