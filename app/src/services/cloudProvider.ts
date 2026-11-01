import { getAuthSnapshot } from "../auth/tokenStore";
import { BACKEND_ENABLED } from "../config";
import { ApiError, apiRequest } from "./api";

/**
 * 「云端优先 + 本机镜像」的通用存储提供者。
 *
 * 数据流（settings 与 plans 共用同一套逻辑）：
 *
 *   未登录 ── load/save ──► localStorage（匿名键，键名与接入后端前完全一致）
 *   已登录 ── load ────────► GET  /api/{settings|plans}
 *                             ├─ 云端有数据 → 覆盖本机镜像（键名带用户 id，互不串号）
 *                             └─ 云端为空   → 把匿名本地数据一次性上云（首登迁移）
 *            save ─────────► 先写本机镜像，再 PUT 云端（失败只告警，不丢本机数据）
 *
 * 设计要点：
 *   - **本机镜像按 userId 分键**（`<key>@u:<userId>`），同一浏览器切换账号不会串数据，
 *     退出登录后回到匿名数据；网络不可用时也能离线继续排课；
 *   - 云端失败一律降级（console.warn + 用本机数据），云服务故障不影响单机功能；
 *   - 并发策略为「最后写入者获胜」；后端支持 If-Match 乐观锁（见 docs/user-backend.md），
 *     如未来要做多设备冲突提示，只需在 apiRequest 上补该请求头。
 */

export interface CloudSyncProvider<T extends object> {
  load(): Promise<Partial<T>>;
  save(value: T): Promise<void>;
}

export interface HybridProviderOptions<T extends object> {
  /** 匿名本地存储键（与接入后端前的键保持一致，保证老用户数据可直接续用） */
  storageKey: string;
  /** 云端端点，如 "/api/settings" */
  endpoint: string;
  /** 日志前缀，如 "设置" */
  label: string;
  /** 判断匿名本地数据是否值得在首次登录时上云 */
  isBlank: (value: Partial<T>) => boolean;
}

export class HybridProvider<T extends object> implements CloudSyncProvider<T> {
  private readonly options: HybridProviderOptions<T>;

  constructor(options: HybridProviderOptions<T>) {
    this.options = options;
  }

  /** 匿名会话用基础键；登录会话用带用户 id 的镜像键 */
  private localKey(userId: string | null): string {
    return userId ? `${this.options.storageKey}@u:${userId}` : this.options.storageKey;
  }

  private readLocal(key: string): Partial<T> {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Partial<T>;
      }
      return {};
    } catch (err) {
      console.warn(`[${this.options.label}] 读取本机数据失败，使用默认值。`, err);
      return {};
    }
  }

  private writeLocal(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[${this.options.label}] 写入本机数据失败。`, err);
    }
  }

  async load(): Promise<Partial<T>> {
    const { userId } = getAuthSnapshot();
    if (!BACKEND_ENABLED || !userId) {
      return this.readLocal(this.localKey(null));
    }

    try {
      const response = await apiRequest<{ data: Partial<T> | null }>(this.options.endpoint);
      if (!response || response.data === null || response.data === undefined) {
        // 云端尚未存过该用户的数据：把匿名本地数据一次性上云（老用户升级路径）
        const anonymous = this.readLocal(this.localKey(null));
        if (!this.options.isBlank(anonymous)) {
          await apiRequest(this.options.endpoint, { method: "PUT", body: { data: anonymous } });
          this.writeLocal(this.localKey(userId), anonymous as T);
        }
        return anonymous;
      }
      this.writeLocal(this.localKey(userId), response.data as T);
      return response.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        console.warn(`[${this.options.label}] 云端不可用，已回退到本机镜像。`, err.message);
      } else {
        console.warn(`[${this.options.label}] 云端读取失败，已回退到本机镜像。`, err);
      }
      return this.readLocal(this.localKey(userId));
    }
  }

  async save(value: T): Promise<void> {
    const { userId } = getAuthSnapshot();
    // 先落本机：即使云端失败或离线，本次改动也不会丢
    this.writeLocal(this.localKey(userId), value);

    if (!BACKEND_ENABLED || !userId) return;

    try {
      await apiRequest(this.options.endpoint, { method: "PUT", body: { data: value } });
    } catch (err) {
      console.warn(`[${this.options.label}] 云端保存失败，已保留本机副本，联网后可重新修改以触发同步。`, err);
    }
  }
}
