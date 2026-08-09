import type { PlanState } from "./types";
import { DEFAULT_PLAN_STATE } from "./types";

/**
 * 配课方案存储提供者接口 —— 多用户方案上云的关键抽象。
 *
 * 当前实现：LocalStoragePlanProvider（浏览器本地持久化，单用户匿名）。
 *
 * 接入后端时：新增 RemotePlanProvider（示例骨架见文件底部注释），
 * 按登录用户隔离存取；仅需替换本文件底部的 planProvider 实例化那一行，
 * PlansContext 与所有业务组件无需任何改动。
 */
export interface PlanProvider {
  /** 读取方案状态；返回完整或部分状态（缺失字段由调用方回填默认值） */
  load(): Promise<Partial<PlanState>>;
  /** 保存完整方案状态快照 */
  save(state: PlanState): Promise<void>;
}

const STORAGE_KEY = "autumn-plan-state";

/** 本地实现：localStorage 持久化（接口保持异步，与远程实现同形） */
export class LocalStoragePlanProvider implements PlanProvider {
  async load(): Promise<Partial<PlanState>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("[方案] 保存本地方案状态失败。", err);
    }
  }
}

/**
 * 远程实现骨架（接入后端时启用）：
 *
 * export class RemotePlanProvider implements PlanProvider {
 *   async load() {
 *     // 按登录用户隔离：session/JWT 由 credentials 携带，
 *     // 服务端将状态挂到对应 userId 下（填充 ownerId）
 *     const res = await fetch("/api/plans", { credentials: "include" });
 *     if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *     return res.json();
 *   }
 *   async save(state) {
 *     await fetch("/api/plans", {
 *       method: "PUT",
 *       headers: { "Content-Type": "application/json" },
 *       credentials: "include",
 *       body: JSON.stringify(state),
 *     });
 *   }
 * }
 */

/** 全局唯一提供者实例：接入后端时仅需把下一行换成 new RemotePlanProvider() */
export const planProvider: PlanProvider = new LocalStoragePlanProvider();

export { DEFAULT_PLAN_STATE };
