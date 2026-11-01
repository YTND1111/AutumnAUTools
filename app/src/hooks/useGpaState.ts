/**
 * 绩点数据的本机持久化（localStorage，键 autumn-gpa-state）。
 *
 * 与 settings / plans 两个 Provider 抽象保持同构思路：页面只调用本 Hook，
 * 换存储位置（例如后续接入用户后端云端同步）时只需替换本文件的读写实现。
 *
 * 数据结构（多学期分别存档，合计口径由页面随时汇总）：
 * {
 *   version: 1,
 *   activeTermId: string,
 *   retakeRule: "best" | "first",
 *   terms: [{ id, name, records: GpaRecord[] }]
 * }
 *
 * 加载时对每个字段做白名单校验（等级/类型必须在已知枚举内、学分必须是有效数字），
 * 避免旧版本或手改 localStorage 造成脏数据进入计算。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type GpaRecord,
  type RetakeRule,
  computeGpa,
  deriveCounted,
} from "../services/gpaCalc";
import { type CourseKind, type Grade, COURSE_KINDS, GRADE_TABLE } from "../services/gpaRules";
import type { ParsedCourse } from "../services/transcriptParse";

export const GPA_STORAGE_KEY = "autumn-gpa-state";

export interface GpaTerm {
  id: string;
  name: string;
  records: GpaRecord[];
}

/** 目标 GPA 规划中的一门待修课程（只有学分，成绩待定；从排课表导入时带课程编号） */
export interface GpaGoalCourse {
  id: string;
  name: string;
  credits: number;
  /** 课程编号（排课表导入的课程才有），用于去重与来源标注 */
  code?: string;
}

/**
 * 目标 GPA 规划的输入存档。
 * 三个数值字段保存为字符串，便于承载输入中的「3.」「」等中间态；使用时再解析。
 */
export interface GpaGoalState {
  targetGpa: string;
  baseGpa: string;
  baseCredits: string;
  courses: GpaGoalCourse[];
}

export const DEFAULT_GOAL: GpaGoalState = {
  targetGpa: "",
  baseGpa: "",
  baseCredits: "",
  courses: [],
};

export interface GpaState {
  version: 1;
  activeTermId: string;
  retakeRule: RetakeRule;
  terms: GpaTerm[];
  goal: GpaGoalState;
}

const GRADE_SET = new Set<string>(GRADE_TABLE.map((item) => item.grade));
const KIND_SET = new Set<string>(COURSE_KINDS.map((item) => item.value));

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** 默认学期名：按当前月份推测当前学期（8 月后为秋季，2–7 月为春季） */
export function defaultTermName(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 8) return `${year}-${year + 1} 秋`;
  if (month <= 1) return `${year - 1}-${year} 秋`;
  return `${year - 1}-${year} 春`;
}

export function createEmptyTerm(name = defaultTermName()): GpaTerm {
  return { id: newId(), name, records: [] };
}

function createInitialState(): GpaState {
  const term = createEmptyTerm();
  return {
    version: 1,
    activeTermId: term.id,
    retakeRule: "best",
    terms: [term],
    goal: { ...DEFAULT_GOAL, courses: [] },
  };
}

/** 目标规划的输入校验：数值字段只保留可解析的字符串，课程学分必须有效 */
function sanitizeGoal(raw: unknown): GpaGoalState {
  const fallback: GpaGoalState = { ...DEFAULT_GOAL, courses: [] };
  if (!raw || typeof raw !== "object") return fallback;
  const item = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 12) : "");
  const coursesRaw = Array.isArray(item.courses) ? item.courses : [];
  const courses: GpaGoalCourse[] = [];
  for (const courseRaw of coursesRaw) {
    if (!courseRaw || typeof courseRaw !== "object") continue;
    const course = courseRaw as Record<string, unknown>;
    const credits = Number(course.credits);
    if (!Number.isFinite(credits) || credits <= 0 || credits > 30) continue;
    courses.push({
      id: typeof course.id === "string" && course.id ? course.id : newId(),
      name: typeof course.name === "string" ? course.name.trim().slice(0, 40) : "",
      credits: Math.round(credits * 10) / 10,
      code: typeof course.code === "string" ? course.code.trim().slice(0, 20) : "",
    });
  }
  return {
    targetGpa: text(item.targetGpa),
    baseGpa: text(item.baseGpa),
    baseCredits: text(item.baseCredits),
    courses,
  };
}

function sanitizeRecord(raw: unknown): GpaRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const credits = Number(item.credits);
  const grade = typeof item.grade === "string" ? item.grade : "";
  const kind = typeof item.kind === "string" ? item.kind : "other";
  if (!name || !Number.isFinite(credits) || credits <= 0 || credits > 100) return null;
  if (!GRADE_SET.has(grade)) return null;
  return {
    id: typeof item.id === "string" && item.id ? item.id : newId(),
    code: typeof item.code === "string" ? item.code : "",
    name,
    credits: Math.round(credits * 10) / 10,
    grade: grade as Grade,
    kind: (KIND_SET.has(kind) ? kind : "other") as CourseKind,
    counted: typeof item.counted === "boolean" ? item.counted : deriveCounted(kind as CourseKind, grade as Grade),
    retake: item.retake === true,
  };
}

/** 读取本机存档（失败或格式不合法时回退为空状态） */
export function loadGpaState(): GpaState {
  try {
    const raw = localStorage.getItem(GPA_STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<GpaState>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.terms)) return createInitialState();

    const terms: GpaTerm[] = [];
    for (const termRaw of parsed.terms) {
      if (!termRaw || typeof termRaw !== "object") continue;
      const term = termRaw as Partial<GpaTerm>;
      const name = typeof term.name === "string" && term.name.trim() ? term.name.trim() : defaultTermName();
      const recordsRaw = Array.isArray(term.records) ? term.records : [];
      const records = recordsRaw.map(sanitizeRecord).filter((record): record is GpaRecord => record !== null);
      terms.push({
        id: typeof term.id === "string" && term.id ? term.id : newId(),
        name,
        records,
      });
    }
    if (terms.length === 0) return createInitialState();

    const activeTermId =
      typeof parsed.activeTermId === "string" && terms.some((term) => term.id === parsed.activeTermId)
        ? parsed.activeTermId
        : terms[0].id;

    return {
      version: 1,
      activeTermId,
      retakeRule: parsed.retakeRule === "first" ? "first" : "best",
      terms,
      goal: sanitizeGoal(parsed.goal),
    };
  } catch {
    return createInitialState();
  }
}

export function saveGpaState(state: GpaState): void {
  try {
    localStorage.setItem(GPA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage 不可用（隐私模式/超额）时静默失败：本次会话仍可用 */
  }
}

/** 把解析出的课程批量转成记录（计入与否按官方规则推导初值） */
export function coursesToRecords(courses: ParsedCourse[]): GpaRecord[] {
  return courses.map((course) => ({
    id: newId(),
    code: course.code,
    name: course.name,
    credits: Math.round(course.credits * 10) / 10,
    grade: course.grade,
    kind: course.kind,
    counted: deriveCounted(course.kind, course.grade),
    retake: course.retake,
  }));
}

export function useGpaState() {
  const [state, setState] = useState<GpaState>(() => loadGpaState());

  // 任何变更都立即写回本机（数据量小，无需防抖）
  useEffect(() => {
    saveGpaState(state);
  }, [state]);

  const activeTerm = useMemo(
    () => state.terms.find((term) => term.id === state.activeTermId) ?? state.terms[0],
    [state]
  );

  const result = useMemo(
    () => computeGpa(activeTerm.records, state.retakeRule),
    [activeTerm.records, state.retakeRule]
  );

  const mutateActiveRecords = useCallback(
    (updater: (records: GpaRecord[]) => GpaRecord[]) => {
      setState((prev) => ({
        ...prev,
        terms: prev.terms.map((term) =>
          term.id === prev.activeTermId ? { ...term, records: updater(term.records) } : term
        ),
      }));
    },
    []
  );

  const addRecord = useCallback(
    (record: GpaRecord) => mutateActiveRecords((records) => [...records, record]),
    [mutateActiveRecords]
  );

  const addRecords = useCallback(
    (records: GpaRecord[]) => mutateActiveRecords((prev) => [...prev, ...records]),
    [mutateActiveRecords]
  );

  const updateRecord = useCallback(
    (id: string, patch: Partial<Omit<GpaRecord, "id">>) =>
      mutateActiveRecords((records) =>
        records.map((record) => {
          if (record.id !== id) return record;
          const next = { ...record, ...patch };
          // 类型或等级变化时，重新推导「是否计入」默认值（用户仍可随后手动改）
          if (patch.kind !== undefined || patch.grade !== undefined) {
            next.counted = deriveCounted(next.kind, next.grade);
          }
          return next;
        })
      ),
    [mutateActiveRecords]
  );

  const removeRecord = useCallback(
    (id: string) => mutateActiveRecords((records) => records.filter((record) => record.id !== id)),
    [mutateActiveRecords]
  );

  const clearRecords = useCallback(() => mutateActiveRecords(() => []), [mutateActiveRecords]);

  const setRetakeRule = useCallback(
    (retakeRule: RetakeRule) => setState((prev) => ({ ...prev, retakeRule })),
    []
  );

  const selectTerm = useCallback(
    (id: string) =>
      setState((prev) => (prev.terms.some((term) => term.id === id) ? { ...prev, activeTermId: id } : prev)),
    []
  );

  const addTerm = useCallback(() => {
    const term = createEmptyTerm();
    setState((prev) => ({ ...prev, activeTermId: term.id, terms: [...prev.terms, term] }));
    return term;
  }, []);

  const renameTerm = useCallback(
    (id: string, name: string) =>
      setState((prev) => ({
        ...prev,
        terms: prev.terms.map((term) => (term.id === id ? { ...term, name: name.trim() || term.name } : term)),
      })),
    []
  );

  const removeTerm = useCallback(
    (id: string) =>
      setState((prev) => {
        if (prev.terms.length <= 1) return prev; // 至少保留一个学期
        const terms = prev.terms.filter((term) => term.id !== id);
        const activeTermId = prev.activeTermId === id ? terms[0].id : prev.activeTermId;
        return { ...prev, terms, activeTermId };
      }),
    []
  );

  // ── 目标 GPA 规划 ────────────────────────────────────────────────
  const updateGoal = useCallback(
    (patch: Partial<Pick<GpaGoalState, "targetGpa" | "baseGpa" | "baseCredits">>) =>
      setState((prev) => ({ ...prev, goal: { ...prev.goal, ...patch } })),
    []
  );

  const addGoalCourses = useCallback(
    (courses: { name: string; credits: number; code?: string }[]) =>
      setState((prev) => ({
        ...prev,
        goal: {
          ...prev.goal,
          courses: [
            ...prev.goal.courses,
            ...courses.map((course) => ({
              id: newId(),
              name: course.name,
              credits: Math.round(course.credits * 10) / 10,
              code: course.code ?? "",
            })),
          ],
        },
      })),
    []
  );

  const updateGoalCourse = useCallback(
    (id: string, patch: Partial<Pick<GpaGoalCourse, "name" | "credits">>) =>
      setState((prev) => ({
        ...prev,
        goal: {
          ...prev.goal,
          courses: prev.goal.courses.map((course) => (course.id === id ? { ...course, ...patch } : course)),
        },
      })),
    []
  );

  const removeGoalCourse = useCallback(
    (id: string) =>
      setState((prev) => ({
        ...prev,
        goal: { ...prev.goal, courses: prev.goal.courses.filter((course) => course.id !== id) },
      })),
    []
  );

  const clearGoalCourses = useCallback(
    () => setState((prev) => ({ ...prev, goal: { ...prev.goal, courses: [] } })),
    []
  );

  return {
    state,
    activeTerm,
    result,
    addRecord,
    addRecords,
    updateRecord,
    removeRecord,
    clearRecords,
    setRetakeRule,
    selectTerm,
    addTerm,
    renameTerm,
    removeTerm,
    newId,
    goal: state.goal,
    updateGoal,
    addGoalCourses,
    updateGoalCourse,
    removeGoalCourse,
    clearGoalCourses,
  };
}
