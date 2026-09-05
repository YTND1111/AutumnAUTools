import { useMemo } from "react";
import type { CourseRecord } from "../services/courseData";
import { splitTeachers } from "../services/courseData";
import type { PlanCardState } from "../plans/types";
import { getCardKey } from "../plans/types";
import { usePlans } from "../plans/PlansContext";

/**
 * usePlanPool —— 候选课程卡片池的领域逻辑 Hook。
 *
 * 职责：
 * - 将持久化的卡片状态（PlanCardState）与课程数据「水合」为完整卡片视图
 *   （options 不持久化，从课程数据重建——与原站 restorePlanState 语义一致；
 *   课程数据缺失的卡片自动丢弃，对应原站"学期切换后旧卡片失效"）；
 * - 提供卡片领域操作：添加（按 code|name 去重，筛选维度初始化为全部可选）、
 *   移除、切换参与排课、切换筛选维度值、清空卡池；
 * - 所有变更经 usePlans() 自动持久化（PlanProvider，后端就绪后按用户隔离）。
 */

/** 卡片下的一个教学班选项（从课程记录重建，不持久化） */
export interface PoolOption {
  poolKey: string;
  courseCode: string;
  courseName: string;
  课序号: string;
  teacher: string;
  campus: string;
  timeText: string;
  weekText: string;
  classText: string;
  locationText: string;
  /** 限选人数（通知单「限选人数」列，教学班粒度） */
  limit: string;
}

export interface PoolCard {
  cardKey: string;
  courseCode: string;
  courseName: string;
  credit: string;
  active: boolean;
  options: PoolOption[];
  availableTeachers: string[];
  availableCampuses: string[];
  availableTimes: string[];
  availableClasses: string[];
  enabledTeachers: string[];
  enabledCampuses: string[];
  enabledTimes: string[];
  enabledClasses: string[];
}

/** 与原站 togglePlanFilter 的四个筛选维度一致：teacher/campus/time/class */
export type FilterDimension = "teachers" | "campuses" | "times" | "classes";

const FILTER_FIELD: Record<FilterDimension, "enabledTeachers" | "enabledCampuses" | "enabledTimes" | "enabledClasses"> = {
  teachers: "enabledTeachers",
  campuses: "enabledCampuses",
  times: "enabledTimes",
  classes: "enabledClasses",
};

/** 与原站 getCourseKey 一致的五元组键 */
function getOptionKey(record: CourseRecord): string {
  return [
    String(record["通知单号"] ?? ""),
    String(record["课程编号"] ?? ""),
    String(record["课序号"] ?? ""),
    String(record["课程名称"] ?? ""),
    String(record["上课时间"] ?? ""),
  ].join("|");
}

export function toPoolOption(record: CourseRecord): PoolOption {
  return {
    poolKey: getOptionKey(record),
    courseCode: String(record["课程编号"] ?? "").trim(),
    courseName: String(record["课程名称"] ?? "").trim(),
    课序号: String(record["课序号"] ?? "").trim(),
    teacher: String(record["教师姓名"] ?? "").trim(),
    campus: String(record["校区"] ?? "").trim(),
    timeText: String(record["上课时间"] ?? "").trim(),
    weekText: String(record["上课周次"] ?? "").trim(),
    classText: String(record["上课班级"] ?? "").trim(),
    locationText: String(record["上课地点"] ?? "").trim(),
    limit: String(record["限选人数"] ?? "").trim(),
  };
}

/** 水合：持久化卡片 + 课程数据 → 完整卡片视图（无匹配课程数据时返回 null） */
function hydrateCard(saved: PlanCardState, courses: CourseRecord[]): PoolCard | null {
  const matched = courses.filter((course) => {
    const code = String(course["课程编号"] ?? "").trim();
    const name = String(course["课程名称"] ?? "").trim();
    return code === saved.courseCode && name === saved.courseName;
  });
  if (!matched.length) return null;

  const options = matched.map(toPoolOption);
  const teacherSet = new Set<string>();
  const campusSet = new Set<string>();
  const timeSet = new Set<string>();
  const classSet = new Set<string>();
  options.forEach((option) => {
    splitTeachers(option.teacher).forEach((teacher) => teacherSet.add(teacher));
    if (option.campus) campusSet.add(option.campus);
    if (option.timeText) timeSet.add(option.timeText);
    if (option.classText) classSet.add(option.classText);
  });

  return {
    cardKey: getCardKey(saved.courseCode, saved.courseName),
    courseCode: saved.courseCode,
    courseName: saved.courseName,
    credit: String(matched[0]["学分"] ?? "").trim(),
    active: saved.active,
    options,
    availableTeachers: Array.from(teacherSet),
    availableCampuses: Array.from(campusSet),
    availableTimes: Array.from(timeSet),
    availableClasses: Array.from(classSet),
    enabledTeachers: saved.enabledTeachers,
    enabledCampuses: saved.enabledCampuses,
    enabledTimes: saved.enabledTimes,
    enabledClasses: saved.enabledClasses,
  };
}

/** 判断教学班是否被当前筛选维度放行（用于 UI 置灰；方案生成模块复用同一语义。
 *  与原站一致：某维度 enabled 集合为空时视为「全部放行」（见原站 candidatesPerCard 过滤）。 */
export function isOptionEnabled(option: PoolOption, card: PoolCard): boolean {
  const teachers = splitTeachers(option.teacher);
  const teacherOk =
    !card.enabledTeachers.length ||
    teachers.some((teacher) => card.enabledTeachers.includes(teacher));
  const campusOk =
    !card.enabledCampuses.length ||
    !option.campus ||
    card.enabledCampuses.includes(option.campus);
  const timeOk =
    !card.enabledTimes.length || card.enabledTimes.includes(option.timeText);
  const classOk =
    !card.enabledClasses.length || card.enabledClasses.includes(option.classText);
  return teacherOk && campusOk && timeOk && classOk;
}

export interface PlanPool {
  ready: boolean;
  cards: PoolCard[];
  /** 参与排课的卡片数 */
  activeCount: number;
  addCourse: (candidate: { code: string; name: string }) => void;
  removeCard: (cardKey: string) => void;
  toggleCardActive: (cardKey: string) => void;
  toggleFilterValue: (cardKey: string, dimension: FilterDimension, value: string) => void;
  clearCards: () => void;
  hasCard: (code: string, name: string) => boolean;
}

export function usePlanPool(courses: CourseRecord[]): PlanPool {
  const { planState, ready, updatePlanState } = usePlans();

  const cards = useMemo(
    () =>
      planState.cards
        .map((saved) => hydrateCard(saved, courses))
        .filter((card): card is PoolCard => card !== null),
    [planState.cards, courses]
  );

  const addCourse: PlanPool["addCourse"] = (candidate) => {
    const code = candidate.code.trim();
    const name = candidate.name.trim();
    if (!code) return;
    updatePlanState((prev) => {
      if (prev.cards.some((card) => card.courseCode === code && card.courseName === name)) {
        return prev; // 已在池中，不重复添加（与原站 cardKey 去重一致）
      }
      // 筛选维度初始化为全部可选值
      const matched = courses.filter((course) => {
        const c = String(course["课程编号"] ?? "").trim();
        const n = String(course["课程名称"] ?? "").trim();
        return c === code && n === name;
      });
      const teacherSet = new Set<string>();
      const campusSet = new Set<string>();
      const timeSet = new Set<string>();
      const classSet = new Set<string>();
      matched.forEach((course) => {
        splitTeachers(course["教师姓名"]).forEach((t) => teacherSet.add(t));
        const campus = String(course["校区"] ?? "").trim();
        if (campus) campusSet.add(campus);
        const timeText = String(course["上课时间"] ?? "").trim();
        if (timeText) timeSet.add(timeText);
        const classText = String(course["上课班级"] ?? "").trim();
        if (classText) classSet.add(classText);
      });
      const card: PlanCardState = {
        courseCode: code,
        courseName: name,
        active: true,
        enabledTeachers: Array.from(teacherSet),
        enabledCampuses: Array.from(campusSet),
        enabledTimes: Array.from(timeSet),
        enabledClasses: Array.from(classSet),
      };
      return { ...prev, cards: [...prev.cards, card] };
    });
  };

  const removeCard: PlanPool["removeCard"] = (cardKey) => {
    updatePlanState((prev) => ({
      ...prev,
      cards: prev.cards.filter((card) => getCardKey(card.courseCode, card.courseName) !== cardKey),
    }));
  };

  const toggleCardActive: PlanPool["toggleCardActive"] = (cardKey) => {
    updatePlanState((prev) => ({
      ...prev,
      cards: prev.cards.map((card) =>
        getCardKey(card.courseCode, card.courseName) === cardKey
          ? { ...card, active: !card.active }
          : card
      ),
    }));
  };

  const toggleFilterValue: PlanPool["toggleFilterValue"] = (cardKey, dimension, value) => {
    const field = FILTER_FIELD[dimension];
    updatePlanState((prev) => ({
      ...prev,
      cards: prev.cards.map((card) => {
        if (getCardKey(card.courseCode, card.courseName) !== cardKey) return card;
        const current = card[field];
        const next = current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value];
        return { ...card, [field]: next };
      }),
    }));
  };

  const clearCards: PlanPool["clearCards"] = () => {
    updatePlanState((prev) => ({ ...prev, cards: [] }));
  };

  const hasCard: PlanPool["hasCard"] = (code, name) =>
    planState.cards.some((card) => card.courseCode === code && card.courseName === name);

  return {
    ready,
    cards,
    activeCount: cards.filter((card) => card.active).length,
    addCourse,
    removeCard,
    toggleCardActive,
    toggleFilterValue,
    clearCards,
    hasCard,
  };
}
