import { useMemo } from "react";
import type { CourseRecord } from "../services/courseData";
import { splitClasses } from "../services/courseData";
import { buildConflictMap, extractMaxWeekFromCourses, formatConflictMessage, parseCourseSchedule } from "../services/scheduleParse";
import type { ScheduleEntry } from "../services/scheduleParse";
import type { PlanCourse } from "../services/planGenerator";
import type { ClassGroupState } from "../plans/types";
import { usePlans } from "../plans/PlansContext";
import type { PoolOption } from "./usePlanPool";
import { toPoolOption } from "./usePlanPool";

/**
 * useClassGroups —— 班级课表组的领域逻辑 Hook（class 模式池 + plan 模式课程组）。
 *
 * 忠实移植 js/CourseArrangement.js 的班级组语义：
 * - 班级组课程列表不持久化，恢复时按 className 从课程数据重建
 *   （courseMatchesClass：上课班级包含班级名，按 poolKey 去重；
 *   学期切换后无匹配课程的组自动丢弃）；
 * - class 模式：检索选中即整班激活；单门课程点击排除/恢复（并自动激活整组）；
 *   一键清除 / 全选；网格显示激活组减去排除项；
 * - plan 模式：课程组作为「固定占用」参与网格显示与方案生成（fixedCourses）；
 * - 复制到方案排课：激活的 class 组连同排除状态深复制到 plan 组并激活；
 * - 全部状态经 PlanProvider 持久化。
 *
 * 与原站的差异：plan 组卡片的冲突信息仅在组内课程间计算
 * （原站还计入当前方案课程——该信息已由网格的冲突高亮与冲突面板覆盖）。
 */

export interface ClassGroupView {
  groupKey: string;
  className: string;
  active: boolean;
  options: PoolOption[];
  excluded: Set<string>;
  /** 当前启用课程数 */
  enabledCount: number;
}

export interface ClassGroups {
  ready: boolean;
  classModeGroups: ClassGroupView[];
  planGroups: ClassGroupView[];
  /** class 模式网格显示课程（激活组 − 排除项，含解析好的课表条目） */
  classModeDisplayCourses: PlanCourse[];
  /** plan 模式固定占用课程（激活 plan 组 − 排除项；网格显示 + 方案生成避让） */
  planGroupCourses: PlanCourse[];
  /** groupKey → 冲突文案（无冲突不收录） */
  classModeConflicts: Map<string, string>;
  planGroupConflicts: Map<string, string>;
  /** class 模式：检索选中班级（新增即整班激活） */
  ingestClassGroup: (className: string) => void;
  toggleClassModeGroup: (groupKey: string) => void;
  toggleClassModeCourse: (groupKey: string, poolKey: string) => void;
  removeClassModeGroup: (groupKey: string) => void;
  clearClassModeGroups: () => void;
  selectAllClassModeGroups: () => void;
  togglePlanGroup: (groupKey: string) => void;
  togglePlanGroupCourse: (groupKey: string, poolKey: string) => void;
  removePlanGroup: (groupKey: string) => void;
  /** 复制激活的 class 组到 plan 组（含排除状态），返回复制数量 */
  copyClassGroupsToPlan: () => { groups: number; courses: number };
}

/** 与原站 getClassGroupKey 一致 */
export function getClassGroupKey(className: string): string {
  return `class-group|${className}`;
}

/** 与原站 courseMatchesClass 一致 */
function courseMatchesClass(option: PoolOption, className: string): boolean {
  const raw = option.classText;
  if (!raw) return false;
  if (raw.includes(className)) return true;
  return splitClasses(raw).includes(className);
}

/** 按班级名从课程数据重建组课程列表（poolKey 去重，与原站 buildClassGroup 一致） */
function buildGroupOptions(className: string, courses: CourseRecord[]): PoolOption[] {
  const seen = new Set<string>();
  const options: PoolOption[] = [];
  courses.forEach((record) => {
    const option = toPoolOption(record);
    if (!courseMatchesClass(option, className)) return;
    if (seen.has(option.poolKey)) return;
    seen.add(option.poolKey);
    options.push(option);
  });
  return options;
}

export function useClassGroups(courses: CourseRecord[]): ClassGroups {
  const { planState, ready, updatePlanState } = usePlans();

  const maxWeek = useMemo(() => extractMaxWeekFromCourses(courses), [courses]);

  // 组课程列表的条目解析缓存（组课程未必在任何卡片里，独立缓存）
  const entriesCache = useMemo(() => {
    const cache = new Map<string, ScheduleEntry[]>();
    const collect = (groups: ClassGroupState[]) => {
      groups.forEach((group) => {
        buildGroupOptions(group.className, courses).forEach((option) => {
          if (!cache.has(option.poolKey)) {
            cache.set(option.poolKey, parseCourseSchedule(option.timeText, option.weekText, maxWeek));
          }
        });
      });
    };
    collect(planState.classModeGroups);
    collect(planState.planClassGroups);
    return cache;
  }, [planState.classModeGroups, planState.planClassGroups, courses, maxWeek]);

  const hydrate = useMemo(() => {
    return (saved: ClassGroupState): ClassGroupView | null => {
      const options = buildGroupOptions(saved.className, courses);
      if (!options.length) return null; // 学期切换后无匹配课程 → 丢弃（与原站一致）
      const excluded = new Set(saved.excludedPoolKeys);
      return {
        groupKey: getClassGroupKey(saved.className),
        className: saved.className,
        active: saved.active,
        options,
        excluded,
        enabledCount: Math.max(options.length - excluded.size, 0),
      };
    };
  }, [courses]);

  const classModeGroups = useMemo(
    () =>
      planState.classModeGroups
        .map(hydrate)
        .filter((group): group is ClassGroupView => group !== null),
    [planState.classModeGroups, hydrate]
  );

  const planGroups = useMemo(
    () =>
      planState.planClassGroups
        .map(hydrate)
        .filter((group): group is ClassGroupView => group !== null),
    [planState.planClassGroups, hydrate]
  );

  const toDisplayCourses = useMemo(() => {
    return (groups: ClassGroupView[]): PlanCourse[] => {
      const result: PlanCourse[] = [];
      groups
        .filter((group) => group.active)
        .forEach((group) => {
          group.options.forEach((option) => {
            if (group.excluded.has(option.poolKey)) return;
            result.push({
              poolKey: option.poolKey,
              cardKey: group.groupKey,
              title: option.courseName,
              courseCode: option.courseCode,
              option,
              entries: entriesCache.get(option.poolKey) ?? [],
            });
          });
        });
      return result;
    };
  }, [entriesCache]);

  const classModeDisplayCourses = useMemo(
    () => toDisplayCourses(classModeGroups),
    [classModeGroups, toDisplayCourses]
  );
  const planGroupCourses = useMemo(
    () => toDisplayCourses(planGroups),
    [planGroups, toDisplayCourses]
  );

  // 组冲突：对全部显示课程做冲突检测后按组聚合（对齐原站 collectConflictTargetsForClassMode）
  const collectConflicts = useMemo(() => {
    return (groups: ClassGroupView[], displayCourses: PlanCourse[]): Map<string, string> => {
      const conflictMap = buildConflictMap(displayCourses.filter((course) => course.entries.length));
      const result = new Map<string, string>();
      groups.forEach((group) => {
        const messages: string[] = [];
        group.options.forEach((option) => {
          if (group.excluded.has(option.poolKey)) return;
          const text = formatConflictMessage(conflictMap.get(option.poolKey));
          if (text) messages.push(text);
        });
        if (messages.length) result.set(group.groupKey, messages.join("；"));
      });
      return result;
    };
  }, []);

  const classModeConflicts = useMemo(
    () => collectConflicts(classModeGroups, classModeDisplayCourses),
    [classModeGroups, classModeDisplayCourses, collectConflicts]
  );
  const planGroupConflicts = useMemo(
    () => collectConflicts(planGroups, planGroupCourses),
    [planGroups, planGroupCourses, collectConflicts]
  );

  // ── class 模式操作 ──

  const ingestClassGroup: ClassGroups["ingestClassGroup"] = (className) => {
    const name = className.trim();
    if (!name) return;
    updatePlanState((prev) => {
      const existing = prev.classModeGroups.find((group) => group.className === name);
      if (existing) {
        return {
          ...prev,
          classModeGroups: prev.classModeGroups.map((group) =>
            group.className === name ? { ...group, active: true } : group
          ),
        };
      }
      return {
        ...prev,
        classModeGroups: [...prev.classModeGroups, { className: name, active: true, excludedPoolKeys: [] }],
      };
    });
  };

  const toggleClassModeGroup: ClassGroups["toggleClassModeGroup"] = (groupKey) => {
    updatePlanState((prev) => ({
      ...prev,
      classModeGroups: prev.classModeGroups.map((group) =>
        getClassGroupKey(group.className) === groupKey ? { ...group, active: !group.active } : group
      ),
    }));
  };

  const toggleCourseExcluded = (
    groups: ClassGroupState[],
    groupKey: string,
    poolKey: string
  ): ClassGroupState[] =>
    groups.map((group) => {
      if (getClassGroupKey(group.className) !== groupKey) return group;
      const excluded = group.excludedPoolKeys.includes(poolKey)
        ? group.excludedPoolKeys.filter((key) => key !== poolKey)
        : [...group.excludedPoolKeys, poolKey];
      // 与原站一致：点击单门课程时自动激活整组
      return { ...group, active: true, excludedPoolKeys: excluded };
    });

  const toggleClassModeCourse: ClassGroups["toggleClassModeCourse"] = (groupKey, poolKey) => {
    updatePlanState((prev) => ({
      ...prev,
      classModeGroups: toggleCourseExcluded(prev.classModeGroups, groupKey, poolKey),
    }));
  };

  const removeClassModeGroup: ClassGroups["removeClassModeGroup"] = (groupKey) => {
    updatePlanState((prev) => ({
      ...prev,
      classModeGroups: prev.classModeGroups.filter((group) => getClassGroupKey(group.className) !== groupKey),
    }));
  };

  const clearClassModeGroups: ClassGroups["clearClassModeGroups"] = () => {
    updatePlanState((prev) => ({ ...prev, classModeGroups: [] }));
  };

  const selectAllClassModeGroups: ClassGroups["selectAllClassModeGroups"] = () => {
    updatePlanState((prev) => ({
      ...prev,
      classModeGroups: prev.classModeGroups.map((group) => ({ ...group, active: true })),
    }));
  };

  // ── plan 模式操作 ──

  const togglePlanGroup: ClassGroups["togglePlanGroup"] = (groupKey) => {
    updatePlanState((prev) => ({
      ...prev,
      planClassGroups: prev.planClassGroups.map((group) =>
        getClassGroupKey(group.className) === groupKey ? { ...group, active: !group.active } : group
      ),
    }));
  };

  const togglePlanGroupCourse: ClassGroups["togglePlanGroupCourse"] = (groupKey, poolKey) => {
    updatePlanState((prev) => ({
      ...prev,
      planClassGroups: toggleCourseExcluded(prev.planClassGroups, groupKey, poolKey),
    }));
  };

  const removePlanGroup: ClassGroups["removePlanGroup"] = (groupKey) => {
    updatePlanState((prev) => ({
      ...prev,
      planClassGroups: prev.planClassGroups.filter((group) => getClassGroupKey(group.className) !== groupKey),
    }));
  };

  const copyClassGroupsToPlan: ClassGroups["copyClassGroupsToPlan"] = () => {
    let copiedGroupCount = 0;
    let copiedCourseCount = 0;

    updatePlanState((prev) => {
      const activeGroups = classModeGroups.filter((group) => group.active);
      copiedGroupCount = activeGroups.length;
      copiedCourseCount = activeGroups.reduce((sum, group) => sum + group.enabledCount, 0);
      if (!activeGroups.length) return prev;

      const nextPlanGroups = [...prev.planClassGroups];
      activeGroups.forEach((group) => {
        const entry: ClassGroupState = {
          className: group.className,
          active: true,
          excludedPoolKeys: Array.from(group.excluded),
        };
        const index = nextPlanGroups.findIndex((item) => item.className === group.className);
        if (index >= 0) nextPlanGroups[index] = entry;
        else nextPlanGroups.push(entry);
      });
      return { ...prev, planClassGroups: nextPlanGroups };
    });

    return { groups: copiedGroupCount, courses: copiedCourseCount };
  };

  return {
    ready,
    classModeGroups,
    planGroups,
    classModeDisplayCourses,
    planGroupCourses,
    classModeConflicts,
    planGroupConflicts,
    ingestClassGroup,
    toggleClassModeGroup,
    toggleClassModeCourse,
    removeClassModeGroup,
    clearClassModeGroups,
    selectAllClassModeGroups,
    togglePlanGroup,
    togglePlanGroupCourse,
    removePlanGroup,
    copyClassGroupsToPlan,
  };
}
