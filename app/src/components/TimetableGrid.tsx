import type { Timetable, TimetableBlock } from "../hooks/useTimetable";
import { BIG_PERIOD_LABELS, WEEK_HEADERS } from "../services/scheduleParse";

/**
 * TimetableGrid —— 课表网格组件（6 大节 × 7 天）。
 *
 * 结构与样式语义对齐原站 #ScheduleGrid：
 * - 周次定位 chips（全部 + 1..maxWeek 周），经 PlanProvider 持久化；
 * - 格子内多个课程块按最早开课周排序、虚线分隔（与原站 slot-divider 一致）；
 * - 冲突课程块红色高亮，title 悬浮显示冲突详情，网格下方汇总冲突文案；
 * - beta 扩展：一张卡片有多个放行教学班时，块上显示「N选1」徽标，
 *   点击块循环切换展示的教学班（会话态，不持久化）。
 */

function CourseBlock({
  block,
  onCycle,
  disabled,
}: {
  block: TimetableBlock;
  onCycle: (cardKey: string) => void;
  disabled?: boolean;
}) {
  const clickable = !disabled && block.enabledCount > 1;
  return (
    <div
      className={`tt-course${block.isConflict ? " is-conflict" : ""}${clickable ? " is-clickable" : ""}`}
      title={
        (block.conflictText ? `${block.conflictText}\n` : "") +
        (clickable ? "点击切换该课程的教学班" : "")
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onCycle(block.cardKey) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onCycle(block.cardKey);
              }
            }
          : undefined
      }
    >
      <div className="tt-course-title">
        {block.title}
        {block.courseCode ? `（${block.courseCode}）` : ""}
        {clickable && <span className="tt-multi-badge">{block.enabledCount}选1</span>}
      </div>
      <div className="tt-course-meta">
        课序号 {block.seqText || "-"} | 地点:{block.locationText || "-"} | 教师:{block.teacher || "-"}
      </div>
    </div>
  );
}

export interface GridPrefEditing {
  /** 是否处于时间段偏好编辑模式（原站 planPrefEditMode） */
  editing: boolean;
  blockedCells: string[]; // "day-bigPeriod"
  blockedDays: number[]; // 1-7
  blockedPeriods: number[]; // 0-5
  onToggleCell: (day: number, bigPeriod: number) => void;
  onToggleDay: (day: number) => void;
  onTogglePeriod: (bigPeriod: number) => void;
}

export default function TimetableGrid({
  timetable,
  pref,
  summary,
  emptyHint,
}: {
  timetable: Timetable;
  pref?: GridPrefEditing;
  /** 覆盖默认副标题（class 模式传入课程数口径） */
  summary?: string;
  /** 覆盖默认空态提示（class 模式传入班级引导文案） */
  emptyHint?: string;
}) {
  const {
    maxWeek,
    selectedWeek,
    setSelectedWeek,
    slots,
    activeCardCount,
    placedCardCount,
    unplacedCards,
    conflictCount,
    cycleOption,
  } = timetable;

  const weekOptions = ["all", ...Array.from({ length: maxWeek }, (_, i) => String(i + 1))];

  // 汇总冲突文案（按块去重，每门课一条）
  const conflictMessages: string[] = [];
  const seenPoolKeys = new Set<string>();
  slots.forEach((blocks) => {
    blocks.forEach((block) => {
      if (block.isConflict && !seenPoolKeys.has(block.poolKey)) {
        seenPoolKeys.add(block.poolKey);
        conflictMessages.push(`「${block.title}」${block.conflictText}`);
      }
    });
  });

  return (
    <section className="surface-card beta-card">
      <h2 className="beta-card-title">
        课表网格
        <span className="beta-card-sub">
          {summary ??
            (activeCardCount
              ? `${placedCardCount}/${activeCardCount} 张卡片已放置 · ${conflictCount} 门冲突`
              : "候选池中没有参与排课的卡片")}
          {selectedWeek === "all" ? " · 周次：全部" : ` · 第 ${selectedWeek} 周`}
        </span>
      </h2>

      {/* 周次定位（持久化，与原站 week-chip 一致） */}
      <div className="tt-week-row" role="radiogroup" aria-label="周次定位">
        {weekOptions.map((week) => (
          <label key={week} className={`tt-week-chip${selectedWeek === week ? " is-on" : ""}`}>
            <input
              type="radio"
              name="betaWeekLocator"
              value={week}
              checked={selectedWeek === week}
              onChange={() => setSelectedWeek(week)}
            />
            <span>{week === "all" ? "全部" : `${week}周`}</span>
          </label>
        ))}
      </div>

      <div className={`tt-grid${pref?.editing ? " is-pref-editing" : ""}`}>
        {WEEK_HEADERS.map((label, index) => {
          const day = index; // 列头 1-7 对应周一..周日，0 为角落
          const blocked = pref ? pref.blockedDays.includes(day) : false;
          const clickable = !!pref?.editing && day > 0;
          return (
            <div
              key={label}
              className={`tt-grid-head${blocked ? " is-blocked" : ""}${clickable ? " is-editable" : ""}`}
              data-axis={index === 0 ? "corner" : "col"}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => pref!.onToggleDay(day) : undefined}
            >
              {label}
            </div>
          );
        })}
        {BIG_PERIOD_LABELS.map((label, bigPeriod) => (
          <div className="tt-grid-row" key={label} style={{ display: "contents" }}>
            <div
              className={`tt-grid-head${pref?.blockedPeriods.includes(bigPeriod) ? " is-blocked" : ""}${pref?.editing ? " is-editable" : ""}`}
              data-axis="row"
              role={pref?.editing ? "button" : undefined}
              tabIndex={pref?.editing ? 0 : undefined}
              onClick={pref?.editing ? () => pref.onTogglePeriod(bigPeriod) : undefined}
            >
              {label}
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const blocks = slots.get(`${day}-${bigPeriod}`) ?? [];
              const cellBlocked = pref
                ? pref.blockedCells.includes(`${day}-${bigPeriod}`) ||
                  pref.blockedDays.includes(day) ||
                  pref.blockedPeriods.includes(bigPeriod)
                : false;
              return (
                <div
                  className={`tt-grid-slot${cellBlocked ? " is-blocked" : ""}${pref?.editing ? " is-editable" : ""}`}
                  key={day}
                  role={pref?.editing ? "button" : undefined}
                  tabIndex={pref?.editing ? 0 : undefined}
                  onClick={pref?.editing ? () => pref.onToggleCell(day, bigPeriod) : undefined}
                >
                  {blocks.map((block, index) => (
                    <div key={`${block.poolKey}-${index}`} style={{ display: "contents" }}>
                      {index > 0 && <hr className="tt-slot-divider" />}
                      <CourseBlock block={block} onCycle={cycleOption} disabled={pref?.editing} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 冲突汇总 */}
      {conflictMessages.length > 0 && (
        <div className="tt-conflict-panel">
          {conflictMessages.map((message) => (
            <p className="tt-conflict-message" key={message}>
              {message}
            </p>
          ))}
        </div>
      )}

      {/* 未放置卡片提示 */}
      {unplacedCards.length > 0 && (
        <p className="muted tt-unplaced">
          未放置：
          {unplacedCards.map((card) => `${card.courseName}（${card.reason}）`).join("；")}
        </p>
      )}

      {activeCardCount === 0 && !summary && (
        <p className="muted">在上方候选池添加课程卡片并勾选「参与排课」后，课程将显示在网格中。</p>
      )}
      {summary && emptyHint && placedCardCount === 0 && <p className="muted">{emptyHint}</p>}
    </section>
  );
}
