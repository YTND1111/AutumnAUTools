import { apiRequest } from "../services/api";
import { HybridProvider } from "../services/cloudProvider";
import type { UserSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

/**
 * 设置存储提供者 —— 三种实现共用一个接口，业务代码零感知。
 *
 * 1. LocalStorageSettingsProvider：纯浏览器本地持久化（匿名 / 关闭后端时使用）；
 * 2. RemoteSettingsProvider：直接读写 Cloudflare Worker 的 /api/settings；
 * 3. HybridSettingsProvider（默认导出实例）：登录时「云端优先 + 本机镜像」，
 *    未登录时纯本地；具体数据流见 services/cloudProvider.ts 顶部注释。
 *
 * 说明：本文件曾经只留了远程实现的注释骨架，现已落地为真实实现；
 * SettingsContext / 业务组件无需任何改动（依旧只依赖 SettingsProvider 接口）。
 */
export interface SettingsProvider {
  /** 读取设置；返回完整或部分设置（缺失字段由调用方回填默认值） */
  load(): Promise<Partial<UserSettings>>;
  /** 保存完整设置快照 */
  save(settings: UserSettings): Promise<void>;
}

/** 匿名本地存储键（与接入后端前完全一致，保证老用户数据可直接续用） */
const STORAGE_KEY = "autumn-user-settings";

/** 本地实现：localStorage 持久化（接口保持异步，与远程实现同形） */
export class LocalStorageSettingsProvider implements SettingsProvider {
  private readonly storageKey: string;

  constructor(storageKey: string = STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  async load(): Promise<Partial<UserSettings>> {
    try {
      const raw = localStorage.getItem(this.storageKey);
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
      localStorage.setItem(this.storageKey, JSON.stringify(settings));
    } catch (err) {
      console.warn("[设置] 保存本地设置失败。", err);
    }
  }
}

/**
 * 远程实现：Cloudflare Worker（backend/）的 /api/settings。
 * 未登录时后端返回 401，apiRequest 会抛 ApiError（调用方决定降级策略）。
 */
export class RemoteSettingsProvider implements SettingsProvider {
  async load(): Promise<Partial<UserSettings>> {
    const res = await apiRequest<{ data: Partial<UserSettings> | null }>("/api/settings");
    return res.data ?? {};
  }

  async save(settings: UserSettings): Promise<void> {
    await apiRequest("/api/settings", { method: "PUT", body: { data: settings } });
  }
}

/**
 * 默认实现（云端优先 + 本机镜像）。
 * 换回纯本地模式有两种方式：
 *   - 构建期：设置 VITE_BACKEND_ENABLED=false；
 *   - 运行期：用户不登录（未登录永远走本地键）。
 */
export class HybridSettingsProvider implements SettingsProvider {
  private readonly hybrid: HybridProvider<UserSettings>;

  constructor(storageKey: string = STORAGE_KEY) {
    this.hybrid = new HybridProvider<UserSettings>({
      storageKey,
      endpoint: "/api/settings",
      label: "设置",
      // 匿名本地仅存过默认值时不值得上云；有 campusPreference 才算有效数据
      isBlank: (value) => value.campusPreference === undefined,
    });
  }

  load(): Promise<Partial<UserSettings>> {
    return this.hybrid.load();
  }

  save(settings: UserSettings): Promise<void> {
    return this.hybrid.save(settings);
  }
}

/** 全局唯一提供者实例（切换存储策略只需改这一行） */
export const settingsProvider: SettingsProvider = new HybridSettingsProvider();

export { DEFAULT_SETTINGS };
