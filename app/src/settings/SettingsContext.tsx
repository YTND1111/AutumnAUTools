import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { UserSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { settingsProvider } from "./provider";

/**
 * 用户设置的 React 集成层。
 *
 * - SettingsContextProvider 挂载时从 SettingsProvider 异步加载设置，
 *   与 DEFAULT_SETTINGS 合并后下发；
 * - updateSettings 先乐观更新内存状态，再防抖 300ms 持久化，
 *   连续修改（如循环切换偏好）只落盘一次；
 * - 消费方统一使用 useSettings()，不感知存储实现（localStorage / 未来后端）。
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

  // 挂载时加载持久化设置
  useEffect(() => {
    let cancelled = false;
    settingsProvider
      .load()
      .then((stored) => {
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...stored });
        }
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
  }, []);

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
