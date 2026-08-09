/**
 * 配课方案领域的数据结构。
 *
 * 设计目标：多用户各自保存配课方案。
 * - 所有方案相关状态集中在 PlanState，读写一律通过 PlanProvider 异步接口
 *   （见 provider.ts）——当前为 localStorage，接入后端后换远程实现，
 *   并按 ownerId 按用户隔离；
 * - 卡片字段语义与原站 ca-state 一致（enabled* 为方案生成的筛选维度，
 *   options 不持久化，恢复时从课程数据重建），保证与未来完整迁移的
 *   方案生成模块语义兼容。
 */

/** 候选池中的课程卡片（持久化部分） */
export interface PlanCardState {
  courseCode: string;
  courseName: string;
  /** 是否参与方案生成 */
  active: boolean;
  /** 允许的教师（空数组语义 = 全部允许；新增卡片时初始化为全部可选值） */
  enabledTeachers: string[];
  /** 允许的校区 */
  enabledCampuses: string[];
  /** 允许的时间段（方案生成模块落地后使用） */
  enabledTimes: string[];
  /** 允许的班级（方案生成模块落地后使用） */
  enabledClasses: string[];
}

/** 已保存的配课方案（预留：方案生成模块落地后填充完整课表快照） */
export interface SavedPlanMeta {
  id: string;
  /** 用户可编辑的方案名（如 "方案A：周三空"） */
  name: string;
  createdAt: string; // ISO 时间戳
  /** 预留：方案完整数据（课程分配结果），由方案生成模块定义 */
  payload?: unknown;
}

/** 班级课表组（持久化部分；课程列表恢复时按 className 从课程数据重建，与原站一致） */
export interface ClassGroupState {
  className: string;
  /** 是否整班选中（参与网格显示；plan 模式下为方案生成的固定占用） */
  active: boolean;
  /** 被单独排除的课程 poolKey 列表 */
  excludedPoolKeys: string[];
}

export interface PlanState {
  version: 1;
  /** 预留：后端用户维度。本地匿名时为 null；接入后端后由登录态填充 */
  ownerId: string | null;
  /** 候选课程卡片池 */
  cards: PlanCardState[];
  /** 已保存的配课方案（预留） */
  savedPlans: SavedPlanMeta[];
  /** 当前选中的方案 id（预留） */
  activePlanId: string | null;
  /** 课表网格的周次定位（"all" 或周次数字符串，与原站 selectedWeek 一致） */
  selectedWeek: string;
  /** 阻塞的格子（"day-bigPeriod"，day 1-7、bigPeriod 0-5，与原站 planPreferences.blockedCells 一致） */
  blockedCells: string[];
  /** 阻塞的整列天（1-7） */
  blockedDays: number[];
  /** 阻塞的整行大节（0-5） */
  blockedPeriods: number[];
  /** plan 模式：来自班级课表的课程组（复制自 class 模式，方案生成时视为固定占用） */
  planClassGroups: ClassGroupState[];
  /** class 模式：班级课表组池 */
  classModeGroups: ClassGroupState[];
}

export const PLAN_STATE_VERSION = 1 as const;

export const DEFAULT_PLAN_STATE: PlanState = {
  version: PLAN_STATE_VERSION,
  ownerId: null,
  cards: [],
  savedPlans: [],
  activePlanId: null,
  selectedWeek: "all",
  blockedCells: [],
  blockedDays: [],
  blockedPeriods: [],
  planClassGroups: [],
  classModeGroups: [],
};

/** 卡片唯一键（与原站 cardKey 规则一致，便于未来互通） */
export function getCardKey(courseCode: string, courseName: string): string {
  return `plan-course|${courseCode}|${courseName}`;
}
