import { useState } from "react";
import type { PlanPool, PoolCard } from "../hooks/usePlanPool";
import { isOptionEnabled } from "../hooks/usePlanPool";

/**
 * CourseCardPool —— 候选课程卡片池组件。
 *
 * 卡片数据语义与原站一致：
 * - 卡片 = 课程（编号+名称），options = 该课全部可选教学班（恢复时从课程数据重建）；
 * - active 控制是否参与方案生成；教师/校区/时间段/班级四个筛选维度（enabled*）
 *   与原站 togglePlanFilter 一致，供方案生成过滤；
 * - 全部状态经 usePlanPool → PlanProvider 持久化（当前 localStorage，后端就绪后按用户隔离）。
 *
 * 与原站的差异：UI 为原生 React 重排（非像素复刻，chips 替代 checkbox），语义保持一致；
 * 原站展开区无教学班列表，此处额外提供 option-list 便于直观看清筛选结果（置灰 = 被过滤）；
 * 教学班行额外展示「限选人数」（通知单「限选人数」列，行内每班一个准确值）。
 */

function FilterChips({
  title,
  values,
  enabled,
  onToggle,
}: {
  title: string;
  values: string[];
  enabled: string[];
  onToggle: (value: string) => void;
}) {
  if (!values.length) return null;
  return (
    <div className="filter-row">
      <span className="filter-title">{title}</span>
      <div className="filter-chips">
        {values.map((value) => {
          const isOn = enabled.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={`filter-chip${isOn ? " is-on" : ""}`}
              aria-pressed={isOn}
              onClick={() => onToggle(value)}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PoolCardView({
  card,
  pool,
}: {
  card: PoolCard;
  pool: PlanPool;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={`pool-card${card.active ? "" : " is-inactive"}`}>
      <header className="pool-card-head">
        <div className="pool-card-title">
          <span className="pool-card-name">{card.courseName}</span>
          <span className="pool-card-code">
            {card.courseCode}
            {card.credit ? ` · ${card.credit} 学分` : ""} · {card.options.length} 个教学班
          </span>
        </div>
        <div className="pool-card-actions">
          <label className="pool-active-toggle">
            <input
              type="checkbox"
              checked={card.active}
              onChange={() => pool.toggleCardActive(card.cardKey)}
            />
            参与排课
          </label>
          <button
            type="button"
            className="pool-icon-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起 ▴" : "筛选 ▾"}
          </button>
          <button
            type="button"
            className="pool-icon-btn pool-remove-btn"
            aria-label={`移除 ${card.courseName}`}
            onClick={() => pool.removeCard(card.cardKey)}
          >
            ×
          </button>
        </div>
      </header>

      {expanded && (
        <div className="pool-card-body">
          <FilterChips
            title="教师"
            values={card.availableTeachers}
            enabled={card.enabledTeachers}
            onToggle={(value) => pool.toggleFilterValue(card.cardKey, "teachers", value)}
          />
          <FilterChips
            title="校区"
            values={card.availableCampuses}
            enabled={card.enabledCampuses}
            onToggle={(value) => pool.toggleFilterValue(card.cardKey, "campuses", value)}
          />
          <FilterChips
            title="时间段"
            values={card.availableTimes}
            enabled={card.enabledTimes}
            onToggle={(value) => pool.toggleFilterValue(card.cardKey, "times", value)}
          />
          <FilterChips
            title="班级"
            values={card.availableClasses}
            enabled={card.enabledClasses}
            onToggle={(value) => pool.toggleFilterValue(card.cardKey, "classes", value)}
          />
          <ul className="option-list">
            {card.options.map((option) => {
              const enabled = isOptionEnabled(option, card);
              return (
                <li key={option.poolKey} className={`option-item${enabled ? "" : " is-dimmed"}`}>
                  <span className="option-seq">课序号 {option.课序号 || "—"}</span>
                  <span className="option-teacher">{option.teacher || "—"}</span>
                  <span className="option-campus">{option.campus || "—"}</span>
                  <span className="option-limit">限选 {option.limit || "—"} 人</span>
                  <span className="option-time">{option.timeText || "时间待定"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

export default function CourseCardPool({ pool }: { pool: PlanPool }) {
  return (
    <section className="surface-card beta-card">
      <h2 className="beta-card-title">
        候选课程卡片池
        <span className="beta-card-sub">
          {pool.cards.length} 张卡片 · {pool.activeCount} 张参与排课 · 自动保存在本地浏览器
        </span>
      </h2>

      {pool.cards.length > 0 && (
        <div className="pool-toolbar">
          <button type="button" className="pool-icon-btn pool-clear-btn" onClick={pool.clearCards}>
            清空卡池
          </button>
        </div>
      )}

      {!pool.ready ? (
        <p className="muted">方案状态加载中…</p>
      ) : pool.cards.length === 0 ? (
        <p className="muted">卡池为空 —— 通过上方课程检索添加课程卡片。</p>
      ) : (
        <div className="pool-card-list">
          {pool.cards.map((card) => (
            <PoolCardView key={card.cardKey} card={card} pool={pool} />
          ))}
        </div>
      )}
    </section>
  );
}
