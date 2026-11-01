import { getAuthSnapshot } from "../auth/tokenStore";
import { apiRequest } from "../services/api";
import { HybridProvider } from "../services/cloudProvider";
import type { PlanState } from "./types";
import { DEFAULT_PLAN_STATE } from "./types";

/**
 * 配课方案存储提供者 —— 多用户方案上云的落地实现。
 *
 * 1. LocalStoragePlanProvider：纯本地持久化（匿名 / 关闭后端时使用）；
 * 2. RemotePlanProvider：直接读写 Cloudflare Worker 的 /api/plans；
 * 3. HybridPlanProvider（默认导出实例）：登录时「云端优先 + 本机镜像」。
 *
 * 与设置层的唯一差别：方案对象带一个预留字段 `ownerId`，这里在登录态下
 * 自动填充为后端用户 id（本机镜像键也按用户分目录，见 services/cloudProvider.ts）。
 */
export interface PlanProvider {
  /** 读取方案状态；返回完整或部分状态（缺失字段由调用方回填默认值） */
  load(): Promise<Partial<PlanState>>;
  /** 保存完整方案状态快照 */
  save(state: PlanState): Promise<void>;
}

/** 匿名本地存储键（与接入后端前完全一致） */
const STORAGE_KEY = "autumn-plan-state";

/** 本地实现：localStorage 持久化（接口保持异步，与远程实现同形） */
export class LocalStoragePlanProvider implements PlanProvider {
  private readonly storageKey: string;

  constructor(storageKey: string = STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  async load(): Promise<Partial<PlanState>> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Partial<PlanState>;
      }
      return {};
    } catch (err) {
      console.warn("[方案] 读取本地方案状态失败，使用默认值。", err);
      return {};
    }
  }

  async save(state: PlanState): Promise<void> {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (err) {
      console.warn("[方案] 保存本地方案状态失败。", err);
    }
  }
}

/**
 * 远程实现：Cloudflare Worker（backend/）的 /api/plans。
 * 服务端按会话用户隔离存储（user_plans 表），并对每次写入递增 revision。
 */
export class RemotePlanProvider implements PlanProvider {
  async load(): Promise<Partial<PlanState>> {
    const res = await apiRequest<{ data: Partial<PlanState> | null }>("/api/plans");
    return res.data ?? {};
  }

  async save(state: PlanState): Promise<void> {
    await apiRequest("/api/plans", { method: "PUT", body: { data: state } });
  }
}

/** 默认实现：云端优先 + 本机镜像 + ownerId 归属标记 */
export class HybridPlanProvider implements PlanProvider {
  private readonly hybrid: HybridProvider<PlanState>;

  constructor(storageKey: string = STORAGE_KEY) {
    this.hybrid = new HybridProvider<PlanState>({
      storageKey,
      endpoint: "/api/plans",
      label: "方案",
      // 空对象（从未保存过）才视为无数据，避免把只改过周次的方案漏掉
      isBlank: (value) => Object.keys(value).length === 0,
    });
  }

  async load(): Promise<Partial<PlanState>> {
    const data = await this.hybrid.load();
    const { userId } = getAuthSnapshot();
    // 登录态：标记数据归属（PlanState.ownerId 为原站预留的「用户维度」字段）
    return userId ? { ...data, ownerId: userId } : data;
  }

  async save(state: PlanState): Promise<void> {
    const { userId } = getAuthSnapshot();
    await this.hybrid.save(userId ? { ...state, ownerId: userId } : state);
  }
}

/** 全局唯一提供者实例（切换存储策略只需改这一行） */
export const planProvider: PlanProvider = new HybridPlanProvider();

export { DEFAULT_PLAN_STATE };
