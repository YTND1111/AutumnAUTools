import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ClassGroupState, PlanState } from "./types";
import { DEFAULT_PLAN_STATE, PLAN_STATE_VERSION } from "./types";
import { planProvider } from "./provider";

/** 旧版数据迁移：合并历史 plan/class 双池为新的班级课表调用组（默认参与排课） */
function mergeLegacyClassGroups(...lists: ClassGroupState[][]): ClassGroupState[] {
  const byName = new Map<string, ClassGroupState>();
  lists.flat().forEach((group) => {
    const prev = byName.get(group.className);
    if (!prev) {
      byName.set(group.className, { ...group });
      return;
    }
    byName.set(group.className, {
      className: group.className,
      active: prev.active || group.active,
      excludedPoolKeys: Array.from(new Set([...prev.excludedPoolKeys, ...group.excludedPoolKeys])),
    });
  });
  return Array.from(byName.values());
}

/**
 * 配课方案状态的 React 集成层（与 settings/SettingsContext 同构）。
 *
 * - PlansContextProvider 挂载时从 PlanProvider 异步加载，与默认值合并后下发；
 * - updatePlanState 接收函数式更新器，先乐观更新内存状态，再防抖 300ms 持久化；
 * - 消费方统一使用 usePlans()，不感知存储实现（localStorage / 未来后端按用户隔离）。
 */

interface PlansContextValue {
  /** 当前方案状态（加载完成前为默认值） */
  planState: PlanState;
  /** 是否已从存储加载完成 */
  ready: boolean;
  /** 函数式更新方案状态（自动防抖持久化） */
  updatePlanState: (updater: (prev: PlanState) => PlanState) => void;
}

const PlansContext = createContext<PlansContextValue>({
  planState: DEFAULT_PLAN_STATE,
  ready: false,
  updatePlanState: () => {},
});

const SAVE_DEBOUNCE_MS = 300;

export function PlansContextProvider({ children }: { children: ReactNode }) {
  const [planState, setPlanState] = useState<PlanState>(DEFAULT_PLAN_STATE);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(0);

  // 挂载时加载持久化方案状态
  useEffect(() => {
    let cancelled = false;
    planProvider
      .load()
      .then((stored) => {
        if (cancelled) return;
        // 旧版迁移：历史 plan/class 双池 → 新的班级课表调用组（classGroups）
        const legacy = stored as Partial<PlanState> & {
          planClassGroups?: ClassGroupState[];
          classModeGroups?: ClassGroupState[];
        };
        const migratedLegacy = Array.isArray(legacy.classGroups)
          ? undefined
          : mergeLegacyClassGroups(legacy.planClassGroups ?? [], legacy.classModeGroups ?? []);
        // 只合并当前版本已知的字段，忽略其他旧版遗留键
        const storedAny = stored as Record<string, unknown>;
        const merged: PlanState = { ...DEFAULT_PLAN_STATE };
        (Object.keys(DEFAULT_PLAN_STATE) as (keyof PlanState)[]).forEach((key) => {
          if (migratedLegacy && key === "classGroups") {
            merged.classGroups = migratedLegacy;
            return;
          }
          const value = storedAny[key];
          if (value !== undefined) {
            (merged as unknown as Record<string, unknown>)[key] = value;
          }
        });
        merged.version = PLAN_STATE_VERSION; // 版本字段始终以当前代码为准
        setPlanState(merged);
      })
      .catch((err) => {
        console.warn("[方案] 加载方案状态失败，使用默认值。", err);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePlanState = useCallback((updater: (prev: PlanState) => PlanState) => {
    setPlanState((prev) => {
      const next = updater(prev);
      // 防抖持久化：连续修改只写一次
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = 0;
        planProvider.save(next).catch((err) => {
          console.warn("[方案] 保存方案状态失败。", err);
        });
      }, SAVE_DEBOUNCE_MS);
      return next;
    });
  }, []);

  // 卸载时清理未落盘的防抖定时器
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, []);

  return (
    <PlansContext.Provider value={{ planState, ready, updatePlanState }}>
      {children}
    </PlansContext.Provider>
  );
}

export function usePlans(): PlansContextValue {
  return useContext(PlansContext);
}
