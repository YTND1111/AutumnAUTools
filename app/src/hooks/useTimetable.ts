import { useMemo, useState } from "react";
import type { CourseRecord } from "../services/courseData";
import {
  buildConflictMap,
  extractMaxWeekFromCourses,
  formatConflictMessage,
  isEntryVisibleByWeek,
  parseCourseSchedule,
  PERIOD_TO_BIG_PERIOD,
} from "../services/scheduleParse";
import type { ScheduleEntry } from "../services/scheduleParse";
import type { PlanCourse } from "../services/planGenerator";
import type { PoolCard, PoolOption } from "./usePlanPool";
import { isOptionEnabled } from "./usePlanPool";
import { usePlans } from "../plans/PlansContext";

/**
 * useTimetable —— 课表网格（6 大节 × 7 天）的领域逻辑 Hook。
 *
 * 数据来源语义：
 * - planCourses 为数组时（方案显示模式，与原站 plan 模式一致）：
 *   网格展示激活方案选定的教学班，块不可切换；
 * - planCourses 为 null 时（过渡预览模式）：
 *   每张参与排课的卡片展示一个「当前教学班」（默认第一个被筛选放行的，
 *   点击块循环切换，会话态不持久化）；
 * - 周次定位（selectedWeek）经 PlanProvider 持久化，与原站一致；
 * - 冲突检测忠实复用原站语义：同一天 + 小节区间相交 + 周次区间相交，
 *   且在全部周次上计算（不随周次定位变化）。
 */

export interface TimetableBlock {
  /** 教学班唯一键（原站 poolKey 五元组） */
  poolKey: string;
  cardKey: string;
  title: string;
  courseCode: string;
  seqText: string;
  teacher: string;
  locationText: string;
  timeText: string;
  /** 该卡片当前被筛选放行的教学班数（>1 时点击块可循环切换） */
  enabledCount: number;
  isConflict: boolean;
  conflictText: string;
}

export interface UnplacedCard {
  cardKey: string;
  courseName: string;
  reason: string;
}

export interface Timetable {
  maxWeek: number;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  /** slotKey = `${dayColumn}-${bigPeriod}`，块列表已按最早开课周排序（与原站一致） */
  slots: Map<string, TimetableBlock[]>;
  activeCardCount: number;
  placedCardCount: number;
  unplacedCards: UnplacedCard[];
  conflictCount: number;
  cycleOption: (cardKey: string) => void;
}

interface DisplayCourse {
  poolKey: string;
  cardKey: string;
  title: string;
  courseCode: string;
  entries: ScheduleEntry[];
  option: PoolOption;
  /** >1 时块可点击循环切换（方案显示模式下恒为 1，不可切换） */
  enabledCount: number;
}

/** 教学班 → 课表条目解析缓存（供 useTimetable 与 usePlanGenerator 共用） */
export function buildEntriesCache(cards: PoolCard[], maxWeek: number): Map<string, ScheduleEntry[]> {
  const cache = new Map<string, ScheduleEntry[]>();
  cards.forEach((card) => {
    card.options.forEach((option) => {
      if (!cache.has(option.poolKey)) {
        cache.set(option.poolKey, parseCourseSchedule(option.timeText, option.weekText, maxWeek));
      }
    });
  });
  return cache;
}

/**
 * @param planCourses 方案生成结果（激活方案的课程列表）：
 *   - null：过渡预览模式——每张参与排课的卡片展示一个教学班（可点击循环切换）；
 *   - 数组：方案显示模式——网格展示该方案选定的教学班（与原站 plan 模式语义一致）。
 */
export function useTimetable(
  cards: PoolCard[],
  courses: CourseRecord[],
  planCourses: PlanCourse[] | null = null
): Timetable {
  const { planState, updatePlanState } = usePlans();
  const selectedWeek = planState.selectedWeek;
  // 每张卡片当前展示的教学班（会话态；方案显示模式下不生效）
  const [choices, setChoices] = useState<Record<string, string>>({});

  const maxWeek = useMemo(() => extractMaxWeekFromCourses(courses), [courses]);

  // 教学班 → 课表条目解析缓存
  const entriesCache = useMemo(() => buildEntriesCache(cards, maxWeek), [cards, maxWeek]);

  const display = useMemo(() => {
    const displayCourses: DisplayCourse[] = [];
    const unplaced: UnplacedCard[] = [];

    if (planCourses !== null) {
      // 方案显示模式：展示方案选定的教学班
      planCourses.forEach((course) => {
        const entries = entriesCache.get(course.poolKey) ?? course.entries;
        if (!entries.length) return;
        displayCourses.push({
          poolKey: course.poolKey,
          cardKey: course.cardKey,
          title: course.title,
          courseCode: course.courseCode,
          entries,
          option: course.option,
          enabledCount: 1,
        });
      });
    } else {
      cards
        .filter((card) => card.active)
        .forEach((card) => {
          const enabledOptions = card.options.filter((option) => isOptionEnabled(option, card));
          if (!enabledOptions.length) {
            unplaced.push({ cardKey: card.cardKey, courseName: card.courseName, reason: "筛选条件已排除全部教学班" });
            return;
          }
          const chosen =
            enabledOptions.find((option) => option.poolKey === choices[card.cardKey]) ?? enabledOptions[0];
          const entries = entriesCache.get(chosen.poolKey) ?? [];
          if (!entries.length) {
            unplaced.push({ cardKey: card.cardKey, courseName: card.courseName, reason: "未能解析上课时间" });
            return;
          }
          displayCourses.push({
            poolKey: chosen.poolKey,
            cardKey: card.cardKey,
            title: card.courseName,
            courseCode: card.courseCode,
            entries,
            option: chosen,
            enabledCount: enabledOptions.length,
          });
        });
    }

    // 冲突检测：全部周次上计算（与原站 buildConflictMap 一致，不随周次定位变化）
    const conflictMap = buildConflictMap(displayCourses);

    // 按 day-period 聚合（与原站 renderGridCourses 一致，记录最早上课周用于排序）
    const slotRaw = new Map<string, { block: TimetableBlock; minWeek: number }[]>();
    displayCourses.forEach((course) => {
      const conflicts = conflictMap.get(course.poolKey);
      const conflictText = formatConflictMessage(conflicts);

      course.entries.forEach((entry) => {
        if (!isEntryVisibleByWeek(entry, selectedWeek)) return;

        const rawMinWeek = entry.weekRanges.reduce((min, range) => Math.min(min, range.start), Infinity);
        const minWeek = Number.isFinite(rawMinWeek) ? rawMinWeek : 0;

        const bigPeriodSet = new Set<number>();
        entry.periods.forEach((period) => {
          const bigPeriod = PERIOD_TO_BIG_PERIOD[period];
          if (bigPeriod !== undefined) bigPeriodSet.add(bigPeriod);
        });

        const block: TimetableBlock = {
          poolKey: course.poolKey,
          cardKey: course.cardKey,
          title: course.title,
          courseCode: course.courseCode,
          seqText: course.option.课序号,
          teacher: course.option.teacher,
          locationText: course.option.locationText,
          timeText: course.option.timeText,
          enabledCount: course.enabledCount,
          isConflict: !!conflicts?.length,
          conflictText,
        };

        bigPeriodSet.forEach((bigPeriod) => {
          const slotKey = `${entry.dayColumn}-${bigPeriod}`;
          if (!slotRaw.has(slotKey)) slotRaw.set(slotKey, []);
          slotRaw.get(slotKey)!.push({ block, minWeek });
        });
      });
    });

    const slotMap = new Map<string, TimetableBlock[]>();
    slotRaw.forEach((items, slotKey) => {
      items.sort((a, b) => a.minWeek - b.minWeek);
      slotMap.set(slotKey, items.map((item) => item.block));
    });

    const conflictCount = displayCourses.filter((course) => conflictMap.get(course.poolKey)?.length).length;

    return { slotMap, unplaced, placedCardCount: displayCourses.length, conflictCount };
  }, [cards, choices, entriesCache, selectedWeek, planCourses]);

  const activeCardCount = cards.filter((card) => card.active).length;

  const setSelectedWeek = (week: string) => {
    updatePlanState((prev) => ({ ...prev, selectedWeek: week }));
  };

  const cycleOption = (cardKey: string) => {
    const card = cards.find((item) => item.cardKey === cardKey);
    if (!card) return;
    const enabledOptions = card.options.filter((option) => isOptionEnabled(option, card));
    if (enabledOptions.length < 2) return;
    // 未手动选择过（choices 无记录）时，当前展示的是第一个放行教学班，
    // 基准索引按 0 计，避免首次点击原地不动
    const recorded = enabledOptions.findIndex((option) => option.poolKey === choices[cardKey]);
    const base = recorded === -1 ? 0 : recorded;
    const next = enabledOptions[(base + 1) % enabledOptions.length];
    setChoices((prev) => ({ ...prev, [cardKey]: next.poolKey }));
  };

  return {
    maxWeek,
    selectedWeek,
    setSelectedWeek,
    slots: display.slotMap,
    activeCardCount,
    placedCardCount: display.placedCardCount,
    unplacedCards: display.unplaced,
    conflictCount: display.conflictCount,
    cycleOption,
  };
}
