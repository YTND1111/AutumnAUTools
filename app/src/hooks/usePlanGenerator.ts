import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CourseRecord } from "../services/courseData";
import { extractMaxWeekFromCourses } from "../services/scheduleParse";
import { generatePlans } from "../services/planGenerator";
import type { GeneratedPlan, PlanCourse, PlanPreferences } from "../services/planGenerator";
import type { PoolCard } from "./usePlanPool";
import { buildEntriesCache } from "./useTimetable";
import { usePlans } from "../plans/PlansContext";
import { useSettings } from "../settings/SettingsContext";

/**
 * usePlanGenerator —— 方案生成的 React 集成层。
 *
 * 语义对齐原站 generatePlans() 及其触发时机：
 * - 生成结果为会话态（原站同样不持久化 generatedPlans，刷新后需重新生成）；
 * - activePlanId 经 PlanProvider 持久化（与原站 savePlanState 一致）；
 * - 校区偏好复用设置层 settings.campusPreference；偏好变化时若有参与排课的
 *   卡片则自动重新生成（与原站 cycleCampusPreference 行为一致）；
 * - 阻塞时段（blockedCells/Days/Periods）来自 PlanState，由网格偏好编辑模式维护。
 */

export interface PlanGenerator {
  plans: GeneratedPlan[];
  conflicts: GeneratedPlan[];
  /** 激活方案 id（"" = 无） */
  activePlanId: string;
  /** 激活方案的课程列表；未生成过时为 null（网格走过渡预览） */
  activePlanCourses: PlanCourse[] | null;
  /** 本次会话是否已生成过 */
  hasGenerated: boolean;
  /** 生成失败文案（原站：不存在满足要求的课程方案） */
  errorText: string;
  /** 显式生成（「生成方案」按钮 / 校区偏好变化自动触发） */
  generate: () => void;
  /** 切换激活方案（pills 点击，持久化 activePlanId） */
  setActivePlan: (id: string) => void;
}

export function usePlanGenerator(
  cards: PoolCard[],
  courses: CourseRecord[],
  /** plan 模式班级课程组的固定占用课程（生成方案时必须避开，原站 fixedCourses） */
  fixedCourses: PlanCourse[] = []
): PlanGenerator {
  const { planState, updatePlanState } = usePlans();
  const { settings, ready: settingsReady } = useSettings();

  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [conflicts, setConflicts] = useState<GeneratedPlan[]>([]);
  const [errorText, setErrorText] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  const maxWeek = useMemo(() => extractMaxWeekFromCourses(courses), [courses]);
  const entriesCache = useMemo(() => buildEntriesCache(cards, maxWeek), [cards, maxWeek]);

  const activeCardCount = cards.filter((card) => card.active).length;

  const generate = useCallback(() => {
    const prefs: PlanPreferences = {
      campusPreference: settings.campusPreference,
      blockedCells: new Set(planState.blockedCells),
      blockedDays: new Set(planState.blockedDays),
      blockedPeriods: new Set(planState.blockedPeriods),
    };
    const result = generatePlans(
      cards,
      prefs,
      (option) => entriesCache.get(option.poolKey) ?? [],
      fixedCourses
    );

    setPlans(result.plans);
    setConflicts(result.conflicts);
    setErrorText(result.error);
    setHasGenerated(true);

    // 激活方案：无冲突方案优先，否则第一套冲突方案（与原站一致）
    const firstId = result.plans[0]?.id ?? result.conflicts[0]?.id ?? "";
    updatePlanState((prev) => ({ ...prev, activePlanId: firstId || null }));
  }, [cards, entriesCache, fixedCourses, planState.blockedCells, planState.blockedDays, planState.blockedPeriods, settings.campusPreference, updatePlanState]);

  // 校区偏好变化 → 自动重新生成（跳过设置尚未就绪与首次记录）
  const prevCampus = useRef<string | null>(null);
  useEffect(() => {
    if (!settingsReady) return;
    if (prevCampus.current === null) {
      prevCampus.current = settings.campusPreference;
      return;
    }
    if (prevCampus.current === settings.campusPreference) return;
    prevCampus.current = settings.campusPreference;
    if (activeCardCount > 0) generate();
  }, [settings.campusPreference, settingsReady, activeCardCount, generate]);

  const activePlanId = planState.activePlanId ?? "";

  const activePlanCourses = useMemo(() => {
    if (!hasGenerated || !activePlanId) return null;
    const active =
      plans.find((plan) => plan.id === activePlanId) ??
      conflicts.find((plan) => plan.id === activePlanId);
    return active ? active.courses : null;
  }, [hasGenerated, activePlanId, plans, conflicts]);

  const setActivePlan = (id: string) => {
    updatePlanState((prev) => ({ ...prev, activePlanId: id }));
  };

  return {
    plans,
    conflicts,
    activePlanId,
    activePlanCourses,
    hasGenerated,
    errorText,
    generate,
    setActivePlan,
  };
}
