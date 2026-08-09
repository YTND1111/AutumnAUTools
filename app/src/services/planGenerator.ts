import type { PoolCard, PoolOption } from "../hooks/usePlanPool";
import { isOptionEnabled } from "../hooks/usePlanPool";
import { intersectRanges, PERIOD_TO_BIG_PERIOD, rangesOverlap } from "./scheduleParse";
import type { ScheduleEntry } from "./scheduleParse";

/**
 * planGenerator —— 方案生成算法纯函数层。
 *
 * 忠实移植 js/CourseArrangement.js 的 generatePlans()：
 * - 候选过滤：卡片四个筛选维度（isOptionEnabled）+ 校区偏好 + 阻塞时段
 *   （阻塞检查遍历全部周次的所有上课小节，不受周次定位影响）；
 * - 回溯枚举选课组合， pairwise 冲突检测（同一天 + 小节区间相交 +
 *   周次区间相交，全学期），无冲突方案与冲突方案各收集至多 20 套；
 * - 任一卡片候选为空 → 返回错误（原站文案「不存在满足要求的课程方案」）。
 *
 * 与原站的差异：班级课程组（fixedCourses）尚未迁移，保留扩展参数；
 * 校区偏好复用设置层（settings.campusPreference）而非单独的状态。
 */

/** 设置层校区偏好 → 课程数据中的校区文本 */
export const CAMPUS_PREF_TEXT: Record<"none" | "east" | "west", string> = {
  none: "无",
  east: "东校区",
  west: "西校区",
};

export interface PlanCourse {
  poolKey: string;
  cardKey: string;
  title: string;
  courseCode: string;
  option: PoolOption;
  entries: ScheduleEntry[];
}

export interface GeneratedPlan {
  id: string;
  name: string;
  courses: PlanCourse[];
}

export interface PlanPreferences {
  campusPreference: "none" | "east" | "west";
  blockedCells: Set<string>; // "day-bigPeriod"
  blockedDays: Set<number>; // 1-7
  blockedPeriods: Set<number>; // 0-5
}

export interface GenerationResult {
  plans: GeneratedPlan[];
  conflicts: GeneratedPlan[];
  /** 有值表示生成失败（原站错误文案） */
  error: string;
}

export const MAX_PLANS_PER_CATEGORY = 20;

/** 与原站 isCellBlocked 一致 */
export function isCellBlocked(day: number, bigPeriod: number, prefs: PlanPreferences): boolean {
  return (
    prefs.blockedCells.has(`${day}-${bigPeriod}`) ||
    prefs.blockedDays.has(day) ||
    prefs.blockedPeriods.has(bigPeriod)
  );
}

/** 与原站 courseEntriesConflict 一致：同一天 + 小节区间相交 + 周次区间相交（全学期） */
export function courseEntriesConflict(a: PlanCourse, b: PlanCourse): boolean {
  for (const entryA of a.entries) {
    for (const entryB of b.entries) {
      if (entryA.dayColumn !== entryB.dayColumn) continue;

      const periodOverlap = entryA.periodRanges.some((pa) =>
        entryB.periodRanges.some((pb) => rangesOverlap(pa, pb))
      );
      if (!periodOverlap) continue;

      const weekOverlap = entryA.weekRanges.some((wa) =>
        entryB.weekRanges.some((wb) => intersectRanges(wa, wb) !== null)
      );
      if (weekOverlap) return true;
    }
  }
  return false;
}

export function generatePlans(
  cards: PoolCard[],
  prefs: PlanPreferences,
  getEntries: (option: PoolOption) => ScheduleEntry[],
  /** 预留：班级课程组固定占用课程（原站 fixedCourses），迁移后传入 */
  fixedCourses: PlanCourse[] = []
): GenerationResult {
  const empty: GenerationResult = { plans: [], conflicts: [], error: "" };
  const activeCards = cards.filter((card) => card.active);

  if (!activeCards.length) {
    return { ...empty, error: "不存在满足要求的课程方案" };
  }

  const campusNoPreference = prefs.campusPreference === "none";
  const campusTarget = CAMPUS_PREF_TEXT[prefs.campusPreference];

  // 每张卡片的候选教学班：四维筛选 + 校区偏好 + 阻塞时段（全学期）
  const candidatesPerCard = activeCards.map((card) => {
    const options = card.options.filter((option) => {
      if (!isOptionEnabled(option, card)) return false;
      if (!campusNoPreference && option.campus !== campusTarget) return false;

      const entries = getEntries(option);
      for (const entry of entries) {
        for (const period of entry.periods) {
          const bigPeriod = PERIOD_TO_BIG_PERIOD[period];
          if (bigPeriod !== undefined && isCellBlocked(entry.dayColumn, bigPeriod, prefs)) {
            return false;
          }
        }
      }
      return true;
    });
    return { card, options };
  });

  if (candidatesPerCard.some((item) => !item.options.length)) {
    return { ...empty, error: "不存在满足要求的课程方案" };
  }

  const plans: GeneratedPlan[] = [];
  const conflicts: GeneratedPlan[] = [];

  const toPlanCourse = (card: PoolCard, option: PoolOption): PlanCourse => ({
    poolKey: option.poolKey,
    cardKey: card.cardKey,
    title: card.courseName,
    courseCode: card.courseCode,
    option,
    entries: getEntries(option),
  });

  function backtrack(index: number, selected: PlanCourse[]): void {
    if (plans.length >= MAX_PLANS_PER_CATEGORY && conflicts.length >= MAX_PLANS_PER_CATEGORY) return;

    if (index >= candidatesPerCard.length) {
      let hasConflict = false;

      // 已选课程两两冲突检测（支持跨多个大节的大课）
      for (let i = 0; i < selected.length && !hasConflict; i += 1) {
        for (let j = i + 1; j < selected.length && !hasConflict; j += 1) {
          if (courseEntriesConflict(selected[i], selected[j])) hasConflict = true;
        }
      }

      // 与固定占用课程（班级课程组，预留）冲突检测
      for (let i = 0; i < selected.length && !hasConflict; i += 1) {
        for (let f = 0; f < fixedCourses.length && !hasConflict; f += 1) {
          if (courseEntriesConflict(selected[i], fixedCourses[f])) hasConflict = true;
        }
      }

      if (!hasConflict && plans.length < MAX_PLANS_PER_CATEGORY) {
        plans.push({
          id: `plan-${plans.length + 1}`,
          name: `方案${plans.length + 1}`,
          courses: selected.map((item) => item),
        });
      } else if (hasConflict && conflicts.length < MAX_PLANS_PER_CATEGORY) {
        conflicts.push({
          id: `conflict-${conflicts.length + 1}`,
          name: `冲突方案${conflicts.length + 1}`,
          courses: selected.map((item) => item),
        });
      }
      return;
    }

    const current = candidatesPerCard[index];
    for (const option of current.options) {
      selected.push(toPlanCourse(current.card, option));
      backtrack(index + 1, selected);
      selected.pop();
      if (plans.length >= MAX_PLANS_PER_CATEGORY && conflicts.length >= MAX_PLANS_PER_CATEGORY) return;
    }
  }

  backtrack(0, []);

  if (!plans.length && !conflicts.length) {
    return { ...empty, error: "不存在满足要求的课程方案" };
  }

  return { plans, conflicts, error: "" };
}
