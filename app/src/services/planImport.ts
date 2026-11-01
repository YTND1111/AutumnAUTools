/**
 * 排课表 → 目标 GPA 规划 的对接：把排课表里「本学期要修的课」转成待修课程（只取名称 + 学分）。
 *
 * 数据来源（都在 PlanState 里，见 plans/types.ts）：
 * - 候选课程卡片（cards）：参与排课的卡片（active=true）视为要修的课；
 *   课程学分需要回查通知单数据（卡片本身只存课程编号/名称）。
 * - 班级课表调用组（classGroups）：激活组内、未被单独排除的课程同样算本学期占用。
 *
 * 学分回查口径与排课表一致：先按「课程编号 + 课程名称」精确匹配通知单记录，
 * 匹配不到再退化为按编号、按名称；都没有就跳过并汇报（因为目标规划必须有学分）。
 *
 * 去重口径：课程编号优先；无编号时用「名称（去空白小写）」。
 * 同一门课在卡片与班级组里重复出现只算一门；已在目标清单里的也不再重复导入。
 */

import type { ClassGroupState, PlanCardState } from "../plans/types";
import type { CourseRecord } from "./courseData";
import { courseMatchesClassText, coursePoolKey } from "./courseData";
import { mergeGoalCourses } from "./goalCourses";

export interface PlanImportCourse {
  name: string;
  credits: number;
  code: string;
}

export interface PlanImportSource {
  /** 卡片与班级组命中数（去重后的最终结果里，来自各来源的课程门数） */
  cardCount: number;
  classCount: number;
  /** 因「未参与排课」被跳过的卡片数 */
  inactiveCards: number;
  /** 通知单里找不到有效学分的课程 */
  missing: { code: string; name: string }[];
  /** 已在目标清单里（或来源内重复）而跳过的门数 */
  duplicates: number;
}

export interface PlanImportResult extends PlanImportSource {
  courses: PlanImportCourse[];
}

const normalizeName = (name: string) => name.replace(/\s+/g, "").toLowerCase();

function creditOf(record: CourseRecord): number {
  const value = Number(record["学分"]);
  if (!Number.isFinite(value) || value <= 0 || value > 30) return 0;
  return Math.round(value * 10) / 10;
}

export function buildGoalCoursesFromPlan(input: {
  cards: PlanCardState[];
  classGroups: ClassGroupState[];
  records: CourseRecord[];
  /** 目标清单里已有的课程（按编号/名称判重） */
  existing: { code?: string; name: string }[];
}): PlanImportResult {
  const { cards, classGroups, records, existing } = input;

  const byCode = new Map<string, CourseRecord[]>();
  const byName = new Map<string, CourseRecord[]>();
  records.forEach((record) => {
    const code = String(record["课程编号"] ?? "").trim();
    const name = String(record["课程名称"] ?? "").trim();
    if (code) {
      const list = byCode.get(code);
      if (list) list.push(record);
      else byCode.set(code, [record]);
    }
    if (name) {
      const key = normalizeName(name);
      const list = byName.get(key);
      if (list) list.push(record);
      else byName.set(key, [record]);
    }
  });

  /** 依次尝试：编号+名称 → 编号 → 名称 */
  const findRecord = (code: string, name: string): CourseRecord | null => {
    if (code) {
      const list = byCode.get(code) ?? [];
      const exact = list.find((record) => String(record["课程名称"] ?? "").trim() === name);
      if (exact) return exact;
      if (list.length) return list[0];
    }
    if (name) {
      const list = byName.get(normalizeName(name));
      if (list?.length) return list[0];
    }
    return null;
  };

  const result: PlanImportResult = {
    courses: [],
    cardCount: 0,
    classCount: 0,
    inactiveCards: 0,
    missing: [],
    duplicates: 0,
  };

  /** 先按来源收集候选，再统一交给 mergeGoalCourses 去重（与 txt 导入共用同一口径） */
  const candidates: { name: string; credits: number; code: string; source: "card" | "class" }[] = [];

  // 1. 候选课程卡片：只导入参与排课的
  cards.forEach((card) => {
    if (!card.active) {
      result.inactiveCards += 1;
      return;
    }
    const code = String(card.courseCode ?? "").trim();
    const name = String(card.courseName ?? "").trim();
    if (!name && !code) return;
    const record = findRecord(code, name);
    const credits = record ? creditOf(record) : 0;
    if (!record || credits <= 0) {
      result.missing.push({ code, name: name || code });
      return;
    }
    candidates.push({ name, credits, code, source: "card" });
  });

  // 2. 班级课表调用组：激活组内未被排除的课程
  classGroups.forEach((group) => {
    if (!group.active) return;
    const excluded = new Set(group.excludedPoolKeys);
    const seenInGroup = new Set<string>();
    records.forEach((record) => {
      const code = String(record["课程编号"] ?? "").trim();
      const name = String(record["课程名称"] ?? "").trim();
      if (!code || !name) return;
      if (seenInGroup.has(code)) return; // 同一门课多个教学班只算一次
      if (!courseMatchesClassText(record["上课班级"], group.className)) return;
      if (excluded.has(coursePoolKey(record))) return;
      const credits = creditOf(record);
      if (credits <= 0) return;
      seenInGroup.add(code);
      candidates.push({ name, credits, code, source: "class" });
    });
  });

  const merged = mergeGoalCourses(existing, candidates);
  const cardCodes = new Set(
    cards
      .filter((card) => card.active)
      .map((card) => String(card.courseCode ?? "").trim())
      .filter(Boolean)
  );

  result.courses = merged.accepted.map(({ name, credits, code }) => ({ name, credits, code: code ?? "" }));
  result.cardCount = merged.accepted.filter((course) => course.code && cardCodes.has(course.code)).length;
  result.classCount = merged.accepted.length - result.cardCount;
  result.duplicates = merged.duplicates;
  return result;
}
