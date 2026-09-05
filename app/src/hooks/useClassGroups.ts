import { useMemo } from "react";
import type { CourseRecord } from "../services/courseData";
import { NON_CLASS_NAME, splitClasses } from "../services/courseData";
import { buildConflictMap, extractMaxWeekFromCourses, formatConflictMessage, parseCourseSchedule } from "../services/scheduleParse";
import type { ScheduleEntry } from "../services/scheduleParse";
import type { PlanCourse } from "../services/planGenerator";
import type { ClassGroupState } from "../plans/types";
import { usePlans } from "../plans/PlansContext";
import type { PoolOption } from "./usePlanPool";
import { toPoolOption } from "./usePlanPool";

/**
 * useClassGroups —— 「班级课表调用」子功能区的领域逻辑 Hook。
 *
 * 班级课表调用是自助方案排课内的子功能：检索班级后整班调用其课表，
 * 该班课程**默认即参与排课**（对应原「复制到方案排课」行为，无需单独复制）：
 * - 激活组的非排除课程（fixedCourses）显示在课表网格，并作为固定占用
 *   参与方案生成避让（usePlanGenerator 的 fixedCourses 入参）；
 * - 单门课程可排除/恢复（自动激活整组）；「取消整班」使整组退出网格；
 *   全选 / 一键清除；
 * - 组课程列表不持久化，恢复时按 className 从课程数据重建
 *   （courseMatchesClass + poolKey 去重；学期切换后无匹配课程的组自动丢弃）；
 * - 组内冲突红色标记（激活组非排除课程之间）；
 * - 全部状态经 PlanProvider 持久化。
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
  /** 班级课表调用组（active = 整班固定占用参与排课） */
  groups: ClassGroupView[];
  /** groupKey → 冲突文案（组内课程间，无冲突不收录） */
  conflicts: Map<string, string>;
  /** 激活组 − 排除项的课程（课表网格显示 + 方案生成固定占用） */
  fixedCourses: PlanCourse[];
  /** 班级检索选中：整班调用并默认激活参与排课（已存在则仅重新激活） */
  addClass: (className: string) => void;
  toggleActive: (groupKey: string) => void;
  toggleCourse: (groupKey: string, poolKey: string) => void;
  removeGroup: (groupKey: string) => void;
  clearAll: () => void;
  selectAll: () => void;
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
    planState.classGroups.forEach((group) => {
      buildGroupOptions(group.className, courses).forEach((option) => {
        if (!cache.has(option.poolKey)) {
          cache.set(option.poolKey, parseCourseSchedule(option.timeText, option.weekText, maxWeek));
        }
      });
    });
    return cache;
  }, [planState.classGroups, courses, maxWeek]);

  const hydrate = useMemo(() => {
    return (saved: ClassGroupState): ClassGroupView | null => {
      // “临班”等非真实班级不可调用（历史遗留的旧组在此自动丢弃）
      if (saved.className === NON_CLASS_NAME) return null;
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

  const groups = useMemo(
    () =>
      planState.classGroups
        .map(hydrate)
        .filter((group): group is ClassGroupView => group !== null),
    [planState.classGroups, hydrate]
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

  const fixedCourses = useMemo(() => toDisplayCourses(groups), [groups, toDisplayCourses]);

  // 组冲突：对全部固定占用课程做冲突检测后按组聚合
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

  const conflicts = useMemo(
    () => collectConflicts(groups, fixedCourses),
    [groups, fixedCourses, collectConflicts]
  );

  // ── 班级课表调用操作（均落在 planState.classGroups 上） ──

  const addClass: ClassGroups["addClass"] = (className) => {
    const name = className.trim();
    if (!name || name === NON_CLASS_NAME) return; // “临班”等非真实班级不可整班调用
    updatePlanState((prev) => {
      const existing = prev.classGroups.find((group) => group.className === name);
      if (existing) {
        return {
          ...prev,
          classGroups: prev.classGroups.map((group) =>
            group.className === name ? { ...group, active: true } : group
          ),
        };
      }
      return {
        ...prev,
        classGroups: [...prev.classGroups, { className: name, active: true, excludedPoolKeys: [] }],
      };
    });
  };

  const toggleActive: ClassGroups["toggleActive"] = (groupKey) => {
    updatePlanState((prev) => ({
      ...prev,
      classGroups: prev.classGroups.map((group) =>
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

  const toggleCourse: ClassGroups["toggleCourse"] = (groupKey, poolKey) => {
    updatePlanState((prev) => ({
      ...prev,
      classGroups: toggleCourseExcluded(prev.classGroups, groupKey, poolKey),
    }));
  };

  const removeGroup: ClassGroups["removeGroup"] = (groupKey) => {
    updatePlanState((prev) => ({
      ...prev,
      classGroups: prev.classGroups.filter((group) => getClassGroupKey(group.className) !== groupKey),
    }));
  };

  const clearAll: ClassGroups["clearAll"] = () => {
    updatePlanState((prev) => ({ ...prev, classGroups: [] }));
  };

  const selectAll: ClassGroups["selectAll"] = () => {
    updatePlanState((prev) => ({
      ...prev,
      classGroups: prev.classGroups.map((group) => ({ ...group, active: true })),
    }));
  };

  return {
    ready,
    groups,
    conflicts,
    fixedCourses,
    addClass,
    toggleActive,
    toggleCourse,
    removeGroup,
    clearAll,
    selectAll,
  };
}
