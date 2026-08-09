import type { CourseRecord } from "./courseData";

/**
 * scheduleParse —— 课表时间/周次解析与冲突检测纯函数。
 *
 * 全部忠实移植自 js/CourseArrangement.js：
 * - parseRangeToken / buildWeekRangesFromText / buildPeriodRangesFromText / mergeRanges
 * - parseCourseSchedule（原函数以课程记录为入参，此处改为 timeText + weekText 两参数，
 *   语义不变；空周次回退 [1..maxWeek]，maxWeek 由 extractMaxWeekFromCourses 给出）
 * - isEntryVisibleByWeek / buildConflictMap / formatConflictMessage
 *
 * 网格术语：小节 period（1-12）→ 大节 bigPeriod（0-5，每大节 2 小节）。
 */

export const WEEK_HEADERS = ["节次", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const DAY_TO_COLUMN: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
};
export const COLUMN_TO_DAY: Record<number, string> = {
  1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日",
};
export const BIG_PERIOD_LABELS = ["第一大节", "第二大节", "第三大节", "第四大节", "第五大节", "第六大节"];
export const PERIOD_TO_BIG_PERIOD: Record<number, number> = {
  1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4, 11: 5, 12: 5,
};

export interface NumRange {
  start: number;
  end: number;
}

/** 解析单个数字或区间 token（如 "3" / "1-11"），非法输入返回空数组 */
export function parseRangeToken(token: string): number[] {
  const clean = String(token ?? "").trim();
  if (!clean) return [];

  if (clean.includes("-")) {
    const [start, end] = clean.split("-").map((value) => Number(value));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const result: number[] = [];
    for (let value = low; value <= high; value += 1) result.push(value);
    return result;
  }

  const single = Number(clean);
  if (!Number.isFinite(single)) return [];
  return [single];
}

/** 周次文本 → 区间数组；空文本回退 [1..maxWeek]（与原站一致） */
export function buildWeekRangesFromText(weekText: string, maxWeek = 20): NumRange[] {
  const content = String(weekText ?? "").trim();
  if (!content) return [{ start: 1, end: maxWeek }];

  const ranges: NumRange[] = [];
  content.split(",").forEach((token) => {
    const values = parseRangeToken(token);
    if (!values.length) return;
    ranges.push({ start: values[0], end: values[values.length - 1] });
  });

  if (!ranges.length) return [{ start: 1, end: maxWeek }];
  return ranges;
}

/** 节次文本（如 "9,10,11,12"）→ 区间数组 */
export function buildPeriodRangesFromText(periodText: string): NumRange[] {
  const ranges: NumRange[] = [];
  String(periodText ?? "")
    .split(",")
    .forEach((token) => {
      const values = parseRangeToken(token);
      if (!values.length) return;
      ranges.push({ start: values[0], end: values[values.length - 1] });
    });
  return ranges;
}

/** 合并相邻/重叠区间（排序后首尾相接即合并） */
export function mergeRanges(ranges: NumRange[]): NumRange[] {
  if (!ranges.length) return [];

  const sorted = ranges
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => a.start - b.start);

  const merged: NumRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const tail = merged[merged.length - 1];
    if (current.start <= tail.end + 1) {
      tail.end = Math.max(tail.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/** 一段上课时间解析结果（对应原站 entry） */
export interface ScheduleEntry {
  dayColumn: number; // 1-7
  periodRanges: NumRange[]; // 小节范围，已钳制到 1-12
  weekRanges: NumRange[];
  periods: number[]; // 展开的小节列表
  rawText: string;
  weekText: string;
}

/**
 * 解析「上课时间」文本（可含多段，; 分隔），每段形如：
 *   周六第9,10,11,12节{第1-2周}(全部)
 * 周次缺失时回退到 weekTextFallback（课程记录的「上课周次」字段）。
 */
export function parseCourseSchedule(
  timeText: string,
  weekTextFallback: string,
  maxWeek = 20
): ScheduleEntry[] {
  const source = String(timeText ?? "").trim();
  if (!source) return [];

  const segments = source
    .split(/[;；]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const entries: ScheduleEntry[] = [];
  segments.forEach((segment) => {
    const match = segment.match(/周([一二三四五六日天])第([\d,\-]+)节(?:\{第([^}]*)周\})?/);
    if (!match) return;

    const dayColumn = DAY_TO_COLUMN[match[1]];
    if (!dayColumn) return;

    const periodRanges = buildPeriodRangesFromText(match[2]).map((range) => ({
      start: Math.max(1, range.start),
      end: Math.min(12, range.end),
    }));

    const weekRawText = String(match[3] || weekTextFallback || "").trim();
    const weekRanges = buildWeekRangesFromText(weekRawText, maxWeek);

    const periods = periodRanges.flatMap((range) => {
      const values: number[] = [];
      for (let p = range.start; p <= range.end; p += 1) values.push(p);
      return values;
    });

    entries.push({ dayColumn, periodRanges, weekRanges, periods, rawText: segment, weekText: weekRawText });
  });

  return entries;
}

/** 从课程数据提取学期最大周次（钳制在 20-30，与原站一致） */
export function extractMaxWeekFromCourses(list: CourseRecord[]): number {
  let max = 20;
  list.forEach((course) => {
    const weekText = String(course["上课周次"] ?? "").trim();
    weekText.split(",").forEach((token) => {
      const values = parseRangeToken(token);
      values.forEach((value) => {
        if (value > max) max = value;
      });
    });
  });
  return Math.min(Math.max(max, 20), 30);
}

/** 周次过滤：selectedWeek 为 "all" 或周次数字符串 */
export function isEntryVisibleByWeek(entry: ScheduleEntry, selectedWeek: string): boolean {
  if (selectedWeek === "all") return true;

  const weekNumber = Number(selectedWeek);
  if (!Number.isFinite(weekNumber)) return true;

  return entry.weekRanges.some((range) => weekNumber >= range.start && weekNumber <= range.end);
}

export function rangesOverlap(a: NumRange, b: NumRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function intersectRanges(a: NumRange, b: NumRange): NumRange | null {
  if (!rangesOverlap(a, b)) return null;
  return { start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) };
}

export function summarizeRanges(ranges: NumRange[]): string {
  return mergeRanges(ranges)
    .map((range) => (range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`))
    .join("、");
}

export function summarizePeriodRanges(ranges: NumRange[]): string {
  return mergeRanges(ranges)
    .map((range) => `第${range.start}${range.start === range.end ? "" : `-${range.end}`}节`)
    .join("、");
}

export interface ConflictSegment {
  dayColumn: number;
  weekRanges: NumRange[];
  periodRanges: NumRange[];
}

export interface ConflictItem<T> {
  withCourse: T;
  segments: ConflictSegment[];
}

/** 冲突检测：同一天、小节区间相交且周次区间相交（与原站 buildConflictMap 一致） */
export function buildConflictMap<T extends { poolKey: string; entries: ScheduleEntry[] }>(
  activeCourses: T[]
): Map<string, ConflictItem<T>[]> {
  const conflictMap = new Map<string, ConflictItem<T>[]>();
  activeCourses.forEach((course) => conflictMap.set(course.poolKey, []));

  for (let i = 0; i < activeCourses.length; i += 1) {
    const a = activeCourses[i];
    for (let j = i + 1; j < activeCourses.length; j += 1) {
      const b = activeCourses[j];

      const overlapSegments: ConflictSegment[] = [];
      a.entries.forEach((entryA) => {
        b.entries.forEach((entryB) => {
          if (entryA.dayColumn !== entryB.dayColumn) return;

          const periodOverlaps: NumRange[] = [];
          entryA.periodRanges.forEach((pA) => {
            entryB.periodRanges.forEach((pB) => {
              const overlapPeriod = intersectRanges(pA, pB);
              if (overlapPeriod) periodOverlaps.push(overlapPeriod);
            });
          });
          if (!periodOverlaps.length) return;

          const weekOverlaps: NumRange[] = [];
          entryA.weekRanges.forEach((wA) => {
            entryB.weekRanges.forEach((wB) => {
              const overlapWeek = intersectRanges(wA, wB);
              if (overlapWeek) weekOverlaps.push(overlapWeek);
            });
          });
          if (!weekOverlaps.length) return;

          overlapSegments.push({
            dayColumn: entryA.dayColumn,
            weekRanges: mergeRanges(weekOverlaps),
            periodRanges: mergeRanges(periodOverlaps),
          });
        });
      });

      if (!overlapSegments.length) continue;

      conflictMap.get(a.poolKey)!.push({ withCourse: b, segments: overlapSegments });
      conflictMap.get(b.poolKey)!.push({ withCourse: a, segments: overlapSegments });
    }
  }

  return conflictMap;
}

/** 冲突文案（与原站 formatConflictMessage 一致） */
export function formatConflictMessage<T extends { title: string }>(
  conflicts: ConflictItem<T>[] | undefined
): string {
  if (!conflicts || !conflicts.length) return "";

  return conflicts
    .map((item) => {
      const segmentText = item.segments
        .map((segment) => {
          const weekText = summarizeRanges(segment.weekRanges);
          const periodText = summarizePeriodRanges(segment.periodRanges);
          return `${COLUMN_TO_DAY[segment.dayColumn]} 第${weekText}周 ${periodText}`;
        })
        .join("，");
      return `与“${item.withCourse.title}”于“${segmentText}”冲突`;
    })
    .join("；");
}
