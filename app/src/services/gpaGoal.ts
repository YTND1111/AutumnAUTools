/**
 * 目标绩点规划（反解本学期需要的成绩组合）。
 *
 * 问题：已知「已修 GPA × 已修学分」与「本学期待修课程的学分」，求达到目标 GPA
 * 需要本学期拿到哪些等级（A / A- / B+ …），并列出所有满足条件的组合。
 *
 * 数学：设已修学分绩点 S0 = G0 × C0，本学期课程学分 cᵢ、绩点 pᵢ，
 *   新 GPA = (S0 + Σpᵢcᵢ) / (C0 + Σcᵢ) ≥ T
 *   ⇔ 本学期需拿到 Σpᵢcᵢ ≥ T·(C0+Σcᵢ) − S0 = needed
 * 因此「是否可达」只取决于 needed 与 4.0·Σcᵢ 的大小关系。
 *
 * 组合枚举的两点口径：
 * - 学分相同的课程视为可互换（成绩组合只按等级多重集计一次），展示时标注可互换；
 * - 「最低达标组合」= 帕累托最小：任意一门课再降一个等级就会跌破目标，
 *   也就是真正回答「最少要修到多少门 A、A-、B+…」的那组答案。
 *
 * 规模控制：等级 10 档，最多 10 门课；用「后缀满分剪枝」+「已达目标时改用
 * 组合数公式」控制计算量；样本/最低组合数均有上限并标注截断，不静默丢结果。
 */

import { type Grade, formatCredit, formatGpa } from "./gpaRules";

export interface GoalCourse {
  id: string;
  name: string;
  credits: number;
}

export interface GoalLevel {
  grade: Grade;
  label: string;
  point: number;
}

/** 规划可用的成绩档位（A+ 与 A 同为 4.0，合并为 A；EX/P/N 不计入 GPA，不参与规划） */
export const GOAL_LEVELS: GoalLevel[] = [
  { grade: "A" as Grade, label: "A", point: 4.0 },
  { grade: "A-" as Grade, label: "A-", point: 3.7 },
  { grade: "B+" as Grade, label: "B+", point: 3.3 },
  { grade: "B" as Grade, label: "B", point: 3.0 },
  { grade: "B-" as Grade, label: "B-", point: 2.7 },
  { grade: "C+" as Grade, label: "C+", point: 2.3 },
  { grade: "C" as Grade, label: "C", point: 2.0 },
  { grade: "D+" as Grade, label: "D+", point: 1.5 },
  { grade: "D" as Grade, label: "D", point: 1.0 },
  { grade: "F" as Grade, label: "F", point: 0 },
];

const LEVEL_COUNT = GOAL_LEVELS.length;
const EPS = 1e-9;
/** 组合枚举支持的待修课程上限（10 档等级，再多组合数不可控） */
export const MAX_GOAL_COURSES = 10;
const MAX_MINIMAL = 200;
const MAX_SAMPLES = 4000;
const NODE_BUDGET = 400_000;

export interface GoalAssignment {
  courseId: string;
  level: number;
  grade: Grade;
  point: number;
}

export interface GoalCombo {
  assignments: GoalAssignment[];
  /** 本学期获得的学分绩点 Σpᵢcᵢ */
  earned: number;
  /** 达标后新 GPA */
  newGpa: number;
  /** 超额部分的学分绩点（0 表示刚好压线） */
  slack: number;
  /** 达到该组合需要各等级的门数（只列出现过的等级，按等级从高到低） */
  counts: { grade: Grade; label: string; count: number }[];
}

export type GoalStatus = "ok" | "invalid" | "already" | "unreachable";

export interface GoalPlan {
  status: GoalStatus;
  /** 一句话结论 */
  message: string;
  baseCreditPoint: number;
  addCredits: number;
  totalCredits: number;
  /** 目标所需总学分绩点 T·(C0+Σcᵢ) */
  requiredCreditPoint: number;
  /** 本学期至少要拿到的学分绩点 */
  neededCreditPoint: number;
  /** 本学期平均绩点要求（needed / Σcᵢ） */
  requiredAverage: number;
  /** 本学期全 A 时可达到的 GPA */
  maxGpa: number;
  /** 按学分从大到小排序后的课程（组合里的下标与它一致） */
  courses: GoalCourse[];
  minimal: GoalCombo[];
  minimalTruncated: boolean;
  samples: GoalCombo[];
  samplesTruncated: boolean;
  /** 满足条件的组合总数（同分组合同分可互换只计一次；可能因预算截断而只是下限） */
  totalCombos: number;
  totalTruncated: boolean;
}

export interface GoalInput {
  baseGpa: number;
  baseCredits: number;
  targetGpa: number;
  courses: GoalCourse[];
}

function emptyPlan(status: GoalStatus, message: string, courses: GoalCourse[] = []): GoalPlan {
  return {
    status,
    message,
    baseCreditPoint: 0,
    addCredits: 0,
    totalCredits: 0,
    requiredCreditPoint: 0,
    neededCreditPoint: 0,
    requiredAverage: 0,
    maxGpa: 0,
    courses,
    minimal: [],
    minimalTruncated: false,
    samples: [],
    samplesTruncated: false,
    totalCombos: 0,
    totalTruncated: false,
  };
}

/** 组合的多重集个数 C(n + k - 1, k - 1)：n 门同学分课程从 k 个等级里选（可重复） */
function multisetCount(n: number, k: number): number {
  if (k <= 0) return 0;
  if (n === 0) return 1;
  // C(n + k - 1, n)
  let result = 1;
  for (let i = 1; i <= n; i += 1) {
    result = (result * (k - 1 + i)) / i;
  }
  return Math.round(result);
}

/** 生成一个组合对象（含等级计数与 GPA） */
function buildCombo(
  levels: number[],
  courses: GoalCourse[],
  baseCreditPoint: number,
  totalCredits: number,
  needed: number
): GoalCombo {
  let earned = 0;
  const counts = new Map<number, number>();
  const assignments: GoalAssignment[] = courses.map((course, index) => {
    const level = levels[index];
    const meta = GOAL_LEVELS[level];
    earned += meta.point * course.credits;
    counts.set(level, (counts.get(level) ?? 0) + 1);
    return { courseId: course.id, level, grade: meta.grade, point: meta.point };
  });

  return {
    assignments,
    earned,
    newGpa: (baseCreditPoint + earned) / totalCredits,
    slack: earned - needed,
    counts: [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, count]) => ({ grade: GOAL_LEVELS[level].grade, label: GOAL_LEVELS[level].label, count })),
  };
}

/** 帕累托最小：任一门课再降一个等级就会跌破目标（全 F 的课无法再降） */
function isMinimal(combo: GoalCombo, courses: GoalCourse[]): boolean {
  return combo.assignments.every((assignment, index) => {
    const next = assignment.level + 1;
    if (next >= LEVEL_COUNT) return true; // 已是最低档 F
    const step = (assignment.point - GOAL_LEVELS[next].point) * courses[index].credits;
    return combo.slack < step - EPS;
  });
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * 规划达成目标 GPA 所需的成绩组合。
 *
 * @param input.baseGpa 已修 GPA（已修学分为 0 时忽略）
 * @param input.baseCredits 已修学分
 * @param input.targetGpa 目标 GPA（0–4.0）
 * @param input.courses 本学期待修课程（学分 > 0；同一门课只填一次）
 */
export function planGoal(input: GoalInput): GoalPlan {
  const { baseGpa, baseCredits, targetGpa, courses } = input;

  if (!Number.isFinite(targetGpa) || targetGpa <= 0 || targetGpa > 4.0) {
    return emptyPlan("invalid", "目标 GPA 需在 0–4.0 之间");
  }
  if (!Number.isFinite(baseCredits) || baseCredits < 0) {
    return emptyPlan("invalid", "已修学分不能为负数");
  }
  if (baseCredits > 0 && (!Number.isFinite(baseGpa) || baseGpa < 0 || baseGpa > 4.0)) {
    return emptyPlan("invalid", "已修 GPA 需在 0–4.0 之间");
  }
  const validCourses = courses.filter((course) => Number.isFinite(course.credits) && course.credits > 0);
  if (validCourses.length === 0) {
    return emptyPlan("invalid", "请先添加本学期待修课程（至少一门，填学分即可）");
  }
  if (validCourses.length > MAX_GOAL_COURSES) {
    return emptyPlan(
      "invalid",
      `组合枚举最多支持 ${MAX_GOAL_COURSES} 门待修课程（当前 ${validCourses.length} 门），可分批计算或只保留本学期实际要修的课`
    );
  }

  // 按学分从大到小排序：同学分课程可互换，排序后组合计数才有稳定口径；
  // 同学分之间保持录入顺序（sort 稳定），组合明细读起来与上方课程列表一致
  const sorted = [...validCourses].sort((a, b) => b.credits - a.credits);
  const addCredits = sorted.reduce((sum, course) => sum + course.credits, 0);
  const totalCredits = baseCredits + addCredits;
  const baseCreditPoint = baseCredits > 0 ? baseGpa * baseCredits : 0;
  const requiredCreditPoint = targetGpa * totalCredits;
  const needed = requiredCreditPoint - baseCreditPoint;
  const maxEarn = GOAL_LEVELS[0].point * addCredits;
  const maxGpa = (baseCreditPoint + maxEarn) / totalCredits;

  const plan: GoalPlan = {
    status: "ok",
    message: "",
    baseCreditPoint: round(baseCreditPoint),
    addCredits: round(addCredits),
    totalCredits: round(totalCredits),
    requiredCreditPoint: round(requiredCreditPoint),
    neededCreditPoint: round(needed),
    requiredAverage: round(needed / addCredits),
    maxGpa: Math.min(4.0, round(maxGpa)),
    courses: sorted,
    minimal: [],
    minimalTruncated: false,
    samples: [],
    samplesTruncated: false,
    totalCombos: 0,
    totalTruncated: false,
  };

  // 已达标：本学期任何成绩（含全 F）都不会跌破目标
  if (needed <= EPS) {
    plan.status = "already";
    plan.message =
      needed <= 0
        ? "已修成绩的余量足够，本学期即使全部不及格也能达到目标（可把目标定得更高再规划）"
        : "已达到目标";
    return plan;
  }

  // 不可达：本学期全部 A 也追不上
  if (needed > maxEarn + EPS) {
    plan.status = "unreachable";
    plan.message = `本学期修满 ${formatCredit(addCredits)} 学分且全部 A 也只能到 ${formatGpa(plan.maxGpa)}，达不到 ${formatGpa(targetGpa)}`;
    return plan;
  }

  const n = sorted.length;
  const credits = sorted.map((course) => course.credits);
  // 同学分区间内按等级下标非降排列（等级从高到低），同组同分只枚举一次
  const sameAsPrev = credits.map((credit, index) => index > 0 && Math.abs(credit - credits[index - 1]) < EPS);

  // 后缀满分（全 A）用于「再努力也追不上」剪枝
  const suffixMax = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) suffixMax[i] = suffixMax[i + 1] + GOAL_LEVELS[0].point * credits[i];

  // 从第 i 门开始的后缀在当前「最低允许等级」下的组合数（同学分区间约束）
  const waysCache = new Map<string, number>();
  const runEnd = (i: number) => {
    let end = i;
    while (end + 1 < n && sameAsPrev[end + 1]) end += 1;
    return end;
  };
  const waysFrom = (i: number, minLevel: number): number => {
    if (i >= n) return 1;
    // 新学分区间的第一门课没有「不低于前一门」的约束
    const effectiveMin = sameAsPrev[i] ? minLevel : 0;
    const key = `${i}:${effectiveMin}`;
    const cached = waysCache.get(key);
    if (cached !== undefined) return cached;
    const end = runEnd(i);
    const size = end - i + 1;
    const choices = LEVEL_COUNT - effectiveMin;
    const result = choices <= 0 ? 0 : multisetCount(size, choices) * waysFrom(end + 1, 0);
    waysCache.set(key, result);
    return result;
  };

  // 计数 DFS：已达目标时直接用组合数收口，避免逐个叶子展开
  let nodes = 0;
  const countAll = (i: number, partial: number, minLevel: number): number => {
    nodes += 1;
    if (nodes > NODE_BUDGET) {
      plan.totalTruncated = true;
      return 0;
    }
    if (partial + suffixMax[i] + EPS < needed) return 0;
    if (partial + EPS >= needed) return waysFrom(i, minLevel);
    const start = sameAsPrev[i] ? minLevel : 0;
    let total = 0;
    for (let level = start; level < LEVEL_COUNT; level += 1) {
      total += countAll(i + 1, partial + GOAL_LEVELS[level].point * credits[i], level);
    }
    return total;
  };

  try {
    plan.totalCombos = countAll(0, 0, 0);
  } catch {
    plan.totalCombos = 0;
    plan.totalTruncated = true;
  }

  // 最低达标组合：slack 必然小于「最小可能单步降幅」0.3 × 最小单科学分，据此剪枝后再精确判定
  const minCredit = Math.min(...credits);
  const slackLimit = 0.3 * minCredit - EPS;
  const collectMinimal = (i: number, partial: number, minLevel: number, levels: number[]) => {
    nodes += 1;
    if (nodes > NODE_BUDGET * 2) {
      plan.minimalTruncated = true;
      return;
    }
    if (partial + suffixMax[i] + EPS < needed) return;
    if (partial - needed > slackLimit) return; // 已经超出太多，不可能再是「刚好达标」
    if (i === n) {
      if (plan.minimal.length >= MAX_MINIMAL) {
        plan.minimalTruncated = true;
        return;
      }
      const combo = buildCombo(levels, sorted, baseCreditPoint, totalCredits, needed);
      if (isMinimal(combo, sorted)) plan.minimal.push(combo);
      return;
    }
    const start = sameAsPrev[i] ? minLevel : 0;
    for (let level = start; level < LEVEL_COUNT; level += 1) {
      levels.push(level);
      collectMinimal(i + 1, partial + GOAL_LEVELS[level].point * credits[i], level, levels);
      levels.pop();
    }
  };
  collectMinimal(0, 0, 0, []);

  // 组合样本：从差到好枚举，先命中「刚好够」的组合；数量到上限就停，避免低目标时刷屏
  const collectSamples = (i: number, partial: number, minLevel: number, levels: number[]) => {
    nodes += 1;
    if (plan.samples.length >= MAX_SAMPLES || nodes > NODE_BUDGET * 3) {
      plan.samplesTruncated = true;
      return;
    }
    if (partial + suffixMax[i] + EPS < needed) return;
    if (i === n) {
      if (partial + EPS >= needed) {
        plan.samples.push(buildCombo(levels, sorted, baseCreditPoint, totalCredits, needed));
      }
      return;
    }
    const start = sameAsPrev[i] ? minLevel : 0;
    for (let level = LEVEL_COUNT - 1; level >= start; level -= 1) {
      levels.push(level);
      collectSamples(i + 1, partial + GOAL_LEVELS[level].point * credits[i], level, levels);
      levels.pop();
    }
  };
  collectSamples(0, 0, 0, []);

  // 样本按新 GPA 升序（刚好达标在前），与最低组合去重后保留前 60 条
  const minimalKeys = new Set(plan.minimal.map((combo) => combo.assignments.map((a) => a.level).join(",")));
  plan.samples = plan.samples
    .filter((combo) => !minimalKeys.has(combo.assignments.map((a) => a.level).join(",")))
    .sort((a, b) => a.newGpa - b.newGpa || a.slack - b.slack)
    .slice(0, 60);

  plan.minimal.sort((a, b) => a.newGpa - b.newGpa || a.slack - b.slack);

  plan.message = `本学期需拿到 ${formatCredit(needed)} 个学分绩点（平均绩点 ≥ ${formatGpa(needed / addCredits)}），共 ${plan.totalCombos} 种成绩组合可以达标`;
  return plan;
}

/** 组合的一句话摘要，如「A×3 · A-×2 · B+×1」 */
export function comboSummary(combo: GoalCombo): string {
  return combo.counts.map((item) => `${item.label}×${item.count}`).join(" · ");
}
