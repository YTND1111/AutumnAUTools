/**
 * 用户设置类型定义。
 *
 * 设计目标：为后续接入后端做准备。所有设置项集中在 UserSettings 中，
 * 读写一律通过 SettingsProvider 异步接口（见 provider.ts），
 * 消费方不感知存储位置——当前为 localStorage，接入后端后换成
 * 远程实现（HTTP API）即可，业务代码零改动。
 */

export interface UserSettings {
  /** 排课表工具：校区偏好（none=无，east=东校区，west=西校区） */
  campusPreference: "none" | "east" | "west";
}

export const DEFAULT_SETTINGS: UserSettings = {
  campusPreference: "none",
};
