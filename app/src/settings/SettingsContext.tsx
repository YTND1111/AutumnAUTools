import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import type { UserSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { settingsProvider } from "./provider";

/**
 * 用户设置的 React 集成层。
 *
 * - SettingsContextProvider 挂载时从 SettingsProvider 异步加载设置，
 *   与 DEFAULT_SETTINGS 合并后下发；
 * - **账号维度**：登录/退出/切换账号时（useAuth().user.id 变化）自动重新加载，
 *   登录用户读云端数据、未登录读本机匿名数据；切换账号瞬间先清空为默认值，
 *   避免短暂显示上一个账号的设置；
 * - updateSettings 先乐观更新内存状态，再防抖 300ms 持久化，
 *   连续修改（如循环切换偏好）只落盘一次；
 * - 消费方统一使用 useSettings()，不感知存储实现（本机 / 云端）。
 */

interface SettingsContextValue {
  /** 当前设置（加载完成前为默认值） */
  settings: UserSettings;
  /** 是否已从存储加载完成（可用于避免初始闪烁） */
  ready: boolean;
  /** 合并更新部分设置 */
  updateSettings: (patch: Partial<UserSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  updateSettings: () => {},
});

const SAVE_DEBOUNCE_MS = 300;

export function SettingsContextProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(0);
  const { user } = useAuth();
  // 账号作用域：登录用户 = 其 id，未登录 = 匿名
  const scope = user?.id ?? "anonymous";
  const loadedScope = useRef<string | null>(null);

  // 挂载时 / 账号切换时加载对应作用域的持久化设置
  useEffect(() => {
    let cancelled = false;
    const scopeChanged = loadedScope.current !== null && loadedScope.current !== scope;
    loadedScope.current = scope;
    if (scopeChanged) {
      setSettings(DEFAULT_SETTINGS);
      setReady(false);
    }
    settingsProvider
      .load()
      .then((stored) => {
        if (cancelled) return;
        // 只合并当前版本已知的设置项，忽略旧版遗留字段（如已移除的排课模式）
        const merged: UserSettings = { ...DEFAULT_SETTINGS };
        (Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[]).forEach((key) => {
          const value = (stored as Partial<UserSettings>)[key];
          if (value !== undefined) merged[key] = value;
        });
        setSettings(merged);
      })
      .catch((err) => {
        console.warn("[设置] 加载设置失败，使用默认值。", err);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // 防抖持久化：连续修改只写一次
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = 0;
        settingsProvider.save(next).catch((err) => {
          console.warn("[设置] 保存设置失败。", err);
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
    <SettingsContext.Provider value={{ settings, ready, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
