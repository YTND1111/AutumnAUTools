import { useState } from "react";
import type { ReactNode } from "react";
import type { ClassGroupView } from "../hooks/useClassGroups";

/**
 * ClassGroupSection —— 班级课表组卡片列表（class 模式池与 plan 模式课程组共用）。
 *
 * 卡片语义对齐原站 class-group-card：
 * - 头部：标题 + 选中整班/取消整班 + 展开/收起 + 删除；
 * - meta：课程数 / 当前启用（= 总数 − 排除数）；
 * - 展开体：单门课程按钮，点击排除/恢复（is-off = 被排除或整组未激活）；
 * - 冲突时卡片显示红色冲突文案；
 * - class 模式额外提供工具栏（一键清除/全选/复制到方案排课）。
 */

function ClassGroupCard({
  group,
  conflictText,
  onToggleActive,
  onToggleCourse,
  onRemove,
}: {
  group: ClassGroupView;
  conflictText?: string;
  onToggleActive: (groupKey: string) => void;
  onToggleCourse: (groupKey: string, poolKey: string) => void;
  onRemove: (groupKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={`class-group-card${group.active ? " is-active" : ""}${conflictText ? " is-conflict" : ""}`}
    >
      <div className="class-group-head">
        <h3 className="class-group-title">班级课表：{group.className}</h3>
        <div className="class-group-actions">
          <button
            type="button"
            className="group-action-btn"
            onClick={() => onToggleActive(group.groupKey)}
          >
            {group.active ? "取消整班" : "选中整班"}
          </button>
          <button
            type="button"
            className="group-action-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起" : "展开"}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => onRemove(group.groupKey)}
          >
            删除
          </button>
        </div>
      </div>

      <p className="class-group-meta">
        课程数：{group.options.length}，当前启用：{group.enabledCount}
      </p>

      {expanded && (
        <div className="class-group-list">
          {group.options.map((option) => {
            const isOff = group.excluded.has(option.poolKey) || !group.active;
            return (
              <button
                key={option.poolKey}
                type="button"
                className={`class-group-course-item${isOff ? " is-off" : ""}`}
                aria-pressed={!isOff}
                onClick={() => onToggleCourse(group.groupKey, option.poolKey)}
              >
                <div className="class-group-course-title">{option.courseName}</div>
                <div className="class-group-course-meta">{option.timeText || "时间待定"}</div>
              </button>
            );
          })}
        </div>
      )}

      {conflictText && <p className="conflict-message">{conflictText}</p>}
    </article>
  );
}

export default function ClassGroupSection({
  title,
  subtitle,
  groups,
  conflicts,
  onToggleActive,
  onToggleCourse,
  onRemove,
  toolbar,
  emptyHint,
}: {
  title: string;
  subtitle?: string;
  groups: ClassGroupView[];
  conflicts: Map<string, string>;
  onToggleActive: (groupKey: string) => void;
  onToggleCourse: (groupKey: string, poolKey: string) => void;
  onRemove: (groupKey: string) => void;
  /** class 模式工具栏（一键清除/全选/复制到方案排课） */
  toolbar?: ReactNode;
  emptyHint: string;
}) {
  if (!groups.length && !toolbar) return null;

  return (
    <section className="surface-card beta-card">
      <h2 className="beta-card-title">
        {title}
        {subtitle && <span className="beta-card-sub">{subtitle}</span>}
      </h2>

      {toolbar}

      {groups.length === 0 ? (
        <p className="muted">{emptyHint}</p>
      ) : (
        <div className="class-group-card-list">
          {groups.map((group) => (
            <ClassGroupCard
              key={group.groupKey}
              group={group}
              conflictText={conflicts.get(group.groupKey)}
              onToggleActive={onToggleActive}
              onToggleCourse={onToggleCourse}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </section>
  );
}
