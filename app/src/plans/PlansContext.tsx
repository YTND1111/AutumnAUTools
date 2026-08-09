import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlanState } from "./types";
import { DEFAULT_PLAN_STATE, PLAN_STATE_VERSION } from "./types";
import { planProvider } from "./provider";

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
        if (!cancelled) {
          setPlanState({
            ...DEFAULT_PLAN_STATE,
            ...stored,
            version: PLAN_STATE_VERSION, // 版本字段始终以当前代码为准
          });
        }
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
