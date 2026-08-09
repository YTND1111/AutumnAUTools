import type { UserSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

/**
 * 设置存储提供者接口 —— 后端就绪的关键抽象。
 *
 * 当前实现：LocalStorageSettingsProvider（浏览器本地持久化）。
 *
 * 接入后端时：新增 RemoteSettingsProvider（示例骨架见文件底部注释），
 * 仅需替换本文件底部的 settingsProvider 实例化那一行，
 * SettingsContext 与所有业务组件无需任何改动。
 */
export interface SettingsProvider {
  /** 读取设置；返回完整或部分设置（缺失字段由调用方回填默认值） */
  load(): Promise<Partial<UserSettings>>;
  /** 保存完整设置快照 */
  save(settings: UserSettings): Promise<void>;
}

const STORAGE_KEY = "autumn-user-settings";

/** 本地实现：localStorage 持久化（接口保持异步，与远程实现同形） */
export class LocalStorageSettingsProvider implements SettingsProvider {
  async load(): Promise<Partial<UserSettings>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Partial<UserSettings>;
      }
      return {};
    } catch (err) {
      console.warn("[设置] 读取本地设置失败，使用默认值。", err);
      return {};
    }
  }

  async save(settings: UserSettings): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn("[设置] 保存本地设置失败。", err);
    }
  }
}

/**
 * 远程实现骨架（接入后端时启用）：
 *
 * export class RemoteSettingsProvider implements SettingsProvider {
 *   async load() {
 *     const res = await fetch("/api/settings", { credentials: "include" });
 *     if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *     return res.json();
 *   }
 *   async save(settings) {
 *     await fetch("/api/settings", {
 *       method: "PUT",
 *       headers: { "Content-Type": "application/json" },
 *       credentials: "include",
 *       body: JSON.stringify(settings),
 *     });
 *   }
 * }
 */

/** 全局唯一提供者实例：接入后端时仅需把下一行换成 new RemoteSettingsProvider() */
export const settingsProvider: SettingsProvider = new LocalStorageSettingsProvider();

export { DEFAULT_SETTINGS };
