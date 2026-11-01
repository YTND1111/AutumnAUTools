import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import type { GpaGoalState } from "../hooks/useGpaState";
import { mergeGoalCourses } from "../services/goalCourses";
import { type GoalCombo, planGoal } from "../services/gpaGoal";
import { formatCredit, formatGpa } from "../services/gpaRules";
import { takePlanHandoff } from "../services/planHandoff";
import { parseTimetableTxt } from "../services/timetableParse";

/**
 * GpaGoalPanel —— 目标 GPA 规划（「要修到 X 需要多少门 A / A- / B+」）。
 *
 * 输入：目标 GPA、已修 GPA 与已修学分（可一键按已录成绩带入）、本学期待修课程（只填学分）。
 * 待修课程有三种导入方式，共用 services/goalCourses.ts 的判重口径：
 * 1. 手动/粘贴录入；
 * 2. 排课表页选定方案后点「导入到绩点规划」——经 sessionStorage 交接（services/planHandoff.ts），
 *    本面板挂载时消费一次；
 * 3. 导入排课表导出的课表 txt（services/timetableParse.ts），或直接点「从排课表导入」
 *    读取当前排课表的卡片/班级课表组。
 * 输出：本学期需达到的平均绩点、最低达标组合（帕累托最小，即「最少要修到多少」）、
 *       以及可展开的全部达标组合。计算全部在 services/gpaGoal.ts（纯函数）里完成。
 */

/** 排课表里可导入的课程来源规模 */
export interface PlanSourceSummary {
  /** 卡片总数 */
  cards: number;
  /** 参与排课的卡片数 */
  activeCards: number;
  /** 激活的班级课表调用组数 */
  classGroups: number;
}

export interface GpaGoalPanelProps {
  goal: GpaGoalState;
  /** 已录成绩合计 GPA（无成绩时为 null） */
  allTimeGpa: number | null;
  /** 已录成绩合计学分 */
  allTimeCredits: number;
  /** 排课表可导入课程规模（用于按钮提示与禁用） */
  planSource: PlanSourceSummary;
  /** 从排课表导入待修课程（由页面实现：读方案状态 + 回查课程学分） */
  onImportFromPlans: (options: { includeClassGroups: boolean }) => Promise<{ added: number; message: string }>;
  onUpdateGoal: (patch: Partial<Pick<GpaGoalState, "targetGpa" | "baseGpa" | "baseCredits">>) => void;
  onAddCourses: (courses: { name: string; credits: number; code?: string }[]) => void;
  onUpdateCourse: (id: string, patch: { name?: string; credits?: number }) => void;
  onRemoveCourse: (id: string) => void;
  onClearCourses: () => void;
}

/** 一门待修课程（学分用草稿态输入，失焦时提交，避免边删边写把值清空） */
function GoalCourseRow({
  name,
  credits,
  code,
  onChange,
  onRemove,
}: {
  name: string;
  credits: number;
  code?: string;
  onChange: (patch: { name?: string; credits?: number }) => void;
  onRemove: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(name);
  const [creditDraft, setCreditDraft] = useState(formatCredit(credits));

  useEffect(() => {
    setNameDraft(name);
  }, [name]);
  useEffect(() => {
    setCreditDraft(formatCredit(credits));
  }, [credits]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (next !== name) onChange({ name: next });
  };
  const commitCredit = () => {
    const value = Number(creditDraft);
    if (Number.isFinite(value) && value > 0 && value <= 30) {
      const rounded = Math.round(value * 10) / 10;
      if (Math.abs(rounded - credits) > 1e-9) onChange({ credits: rounded });
      setCreditDraft(formatCredit(rounded));
    } else {
      setCreditDraft(formatCredit(credits));
    }
  };

  return (
    <div className="gpa-goal-course-row">
      <input
        className="gpa-input gpa-goal-course-name"
        value={nameDraft}
        placeholder="课程名称（可空）"
        aria-label="待修课程名称"
        onChange={(event) => setNameDraft(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {code && (
        <span className="gpa-goal-src" title={`课程编号 ${code}（从排课表导入）`}>
          排课表
        </span>
      )}
      <input
        className="gpa-input gpa-goal-course-credit"
        value={creditDraft}
        inputMode="decimal"
        placeholder="学分"
        aria-label="待修课程学分"
        onChange={(event) => setCreditDraft(event.target.value)}
        onBlur={commitCredit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <button type="button" className="gpa-icon-btn" aria-label={`删除 ${name || "该课程"}`} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/** 一行组合：等级摘要 + 达标后 GPA + 逐门课程明细 */
function ComboRow({ combo, courses }: { combo: GoalCombo; courses: { name: string; credits: number }[] }) {
  const detail = combo.assignments
    .map((assignment, index) => {
      const course = courses[index];
      const label = course?.name || `课程${index + 1}`;
      return `${label}（${formatCredit(course?.credits ?? 0)}）${assignment.grade}`;
    })
    .join(" · ");

  return (
    <div className="gpa-goal-combo">
      <div className="gpa-goal-combo-head">
        <span className="gpa-goal-chips">
          {combo.counts.map((item) => (
            <span className="gpa-goal-chip" key={item.grade}>
              <b>{item.label}</b>×{item.count}
            </span>
          ))}
        </span>
        <span className="gpa-goal-combo-gpa">→ {formatGpa(combo.newGpa)}</span>
        <span className={combo.slack < 0.005 ? "gpa-goal-slack is-tight" : "gpa-goal-slack"}>
          {combo.slack < 0.005 ? "刚好压线" : `余量 +${combo.slack.toFixed(2)}`}
        </span>
      </div>
      <div className="gpa-goal-combo-detail">{detail}</div>
    </div>
  );
}

export default function GpaGoalPanel({
  goal,
  allTimeGpa,
  allTimeCredits,
  planSource,
  onImportFromPlans,
  onUpdateGoal,
  onAddCourses,
  onUpdateCourse,
  onRemoveCourse,
  onClearCourses,
}: GpaGoalPanelProps) {
  const [formName, setFormName] = useState("");
  const [formCredit, setFormCredit] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [includeClassGroups, setIncludeClassGroups] = useState(false);
  const autoFilled = useRef(false);
  const handoffDone = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 首次进入且已有成绩、规划基线为空时，自动带入已录成绩
  useEffect(() => {
    if (autoFilled.current) return;
    if (goal.baseCredits.trim() || goal.baseGpa.trim()) return;
    if (allTimeGpa === null || allTimeCredits <= 0) return;
    autoFilled.current = true;
    onUpdateGoal({ baseGpa: String(Math.round(allTimeGpa * 10000) / 10000), baseCredits: String(allTimeCredits) });
  }, [allTimeGpa, allTimeCredits, goal.baseCredits, goal.baseGpa, onUpdateGoal]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  // 从排课表跳转过来时，消费一次交接数据（挂载即导入，刷新/新标签页不会重复）
  useEffect(() => {
    if (handoffDone.current) return;
    handoffDone.current = true;
    const payload = takePlanHandoff();
    if (!payload) return;
    const merged = mergeGoalCourses(goal.courses, payload.courses);
    if (merged.accepted.length) onAddCourses(merged.accepted);
    const parts = [`已从排课表方案导入 ${merged.accepted.length} 门课程`];
    if (merged.duplicates) parts.push(`跳过 ${merged.duplicates} 门已在清单里的课程`);
    if (payload.missing) parts.push(`${payload.missing} 门在通知单里找不到学分，未带入`);
    setStatus(parts.join("，"));
    // 仅在挂载时执行一次（goal.courses / onAddCourses 通过 ref 守卫固定为首次快照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 导入排课表导出的课表 txt（如「课表清单_2026-10-28_11-30.txt」） */
  const handleTxtFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatus("文件过大（超过 2 MB），请确认是课表清单 txt");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseTimetableTxt(text);
      if (!parsed.courses.length) {
        setStatus(
          `没有从「${file.name}」识别到课程${parsed.skipped.length ? `（${parsed.skipped.length} 处缺少课程名或学分）` : ""}`
        );
        return;
      }
      const merged = mergeGoalCourses(goal.courses, parsed.courses);
      if (merged.accepted.length) onAddCourses(merged.accepted);
      const parts = [`已从「${file.name}」导入 ${merged.accepted.length} 门课程`];
      if (merged.duplicates) parts.push(`跳过 ${merged.duplicates} 门已在清单里的课程`);
      if (parsed.duplicates) parts.push(`合并 ${parsed.duplicates} 门同编号课程`);
      if (parsed.skipped.length) parts.push(`${parsed.skipped.length} 块缺少课程名或学分`);
      setStatus(parts.join("，"));
    } catch {
      setStatus("读取 txt 失败，请确认文件是 UTF-8 编码的文本");
    }
  };

  const target = Number(goal.targetGpa);
  const baseCredits = goal.baseCredits.trim() === "" ? NaN : Number(goal.baseCredits);
  const baseGpa = goal.baseGpa.trim() === "" ? NaN : Number(goal.baseGpa);
  const ready =
    goal.targetGpa.trim() !== "" &&
    Number.isFinite(target) &&
    Number.isFinite(baseCredits) &&
    (baseCredits === 0 || (goal.baseGpa.trim() !== "" && Number.isFinite(baseGpa)));

  const plan = useMemo(
    () =>
      ready
        ? planGoal({
            baseGpa: baseCredits === 0 ? 0 : baseGpa,
            baseCredits,
            targetGpa: target,
            courses: goal.courses,
          })
        : null,
    [ready, baseCredits, baseGpa, target, goal.courses]
  );

  const handleAdd = () => {
    const credits = Number(formCredit);
    if (!Number.isFinite(credits) || credits <= 0 || credits > 30) {
      setStatus("请填写 0.5–30 之间的学分");
      return;
    }
    onAddCourses([{ name: formName.trim(), credits: Math.round(credits * 10) / 10 }]);
    setFormName("");
    setFormCredit("");
  };

  const handleApplyFromRecords = () => {
    if (allTimeGpa === null || allTimeCredits <= 0) {
      setStatus("还没有已录成绩，先把成绩录入表格填好再带入");
      return;
    }
    onUpdateGoal({ baseGpa: String(Math.round(allTimeGpa * 10000) / 10000), baseCredits: String(allTimeCredits) });
    setStatus(`已带入：已修 ${formatCredit(allTimeCredits)} 学分，GPA ${formatGpa(allTimeGpa)}`);
  };

  const planImportable = planSource.activeCards + planSource.classGroups > 0;
  const handleImportFromPlans = async () => {
    if (importing || !planImportable) return;
    setImporting(true);
    try {
      const outcome = await onImportFromPlans({ includeClassGroups });
      setStatus(outcome.message);
    } catch (err) {
      setStatus(err instanceof Error ? `导入失败：${err.message}` : "导入失败：课程数据或排课表读取异常");
    } finally {
      setImporting(false);
    }
  };

  const handlePasteCourses = () => {
    const rows: { name: string; credits: number }[] = [];
    let skipped = 0;
    for (const raw of pasteText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const tokens = line.split(/[\t,，\s]+/).filter(Boolean);
      if (!tokens.length) continue;
      // 末位数字为学分，其余为课程名（没有名称也可导入，显示为「课程N」）
      const creditToken = [...tokens].reverse().find((token) => /^\d+(\.\d+)?$/.test(token));
      if (!creditToken) {
        skipped += 1;
        continue;
      }
      const credits = Number(creditToken);
      const creditIndex = tokens.lastIndexOf(creditToken);
      const name = tokens
        .filter((_, index) => index !== creditIndex)
        .join(" ")
        .trim();
      if (!Number.isFinite(credits) || credits <= 0 || credits > 30) {
        skipped += 1;
        continue;
      }
      rows.push({ name, credits: Math.round(credits * 10) / 10 });
    }
    if (!rows.length) {
      setStatus("没有识别到「课程名 + 学分」的行");
      return;
    }
    onAddCourses(rows);
    setStatus(`已添加 ${rows.length} 门课程${skipped ? `，跳过 ${skipped} 行` : ""}`);
    setPasteText("");
    setPasteOpen(false);
  };

  return (
    <div className="surface-card gpa-goal-card">
      <div className="title-bar">
        <span className="title">目标 GPA 规划</span>
        <span className="gpa-goal-tag">按等级组合反解</span>
      </div>

      <p className="gpa-hint">
        填好目标与已修基线，再列出本学期待修课程的学分（成绩未知），即可反推出每门课至少要修到哪一档。
        同绩点等级合并计算（A+ 与 A 同为 4.0）；通识课与 EX/P/N 不参与 GPA，计算时不要计入。
        「按已录成绩带入」用的是全部已录成绩——若里面已经包含本学期课程，请把已修学分改小，避免重复计算。
        待修课程有三种填法：手动/粘贴、导入课表 txt（排课表页「导出当前课表」生成的文件），
        或在排课表选定方案后点「导入到绩点规划」直接带过来。
      </p>

      <div className="gpa-goal-base">
        <label className="gpa-goal-field">
          <span>目标 GPA</span>
          <input
            className="gpa-input"
            value={goal.targetGpa}
            inputMode="decimal"
            placeholder="如 3.8"
            onChange={(event) => onUpdateGoal({ targetGpa: event.target.value })}
          />
        </label>
        <label className="gpa-goal-field">
          <span>已修 GPA</span>
          <input
            className="gpa-input"
            value={goal.baseGpa}
            inputMode="decimal"
            placeholder="如 3.7"
            onChange={(event) => onUpdateGoal({ baseGpa: event.target.value })}
          />
        </label>
        <label className="gpa-goal-field">
          <span>已修学分</span>
          <input
            className="gpa-input"
            value={goal.baseCredits}
            inputMode="decimal"
            placeholder="如 60"
            onChange={(event) => onUpdateGoal({ baseCredits: event.target.value })}
          />
        </label>
        <button type="button" className="gpa-btn" onClick={handleApplyFromRecords}>
          按已录成绩带入
        </button>
      </div>

      {/* 待修课程 */}
      <div className="gpa-goal-courses">
        <div className="gpa-goal-courses-head">
          <span className="gpa-goal-subtitle">
            本学期待修课程（{goal.courses.length} 门 / 共 {formatCredit(goal.courses.reduce((sum, course) => sum + course.credits, 0))} 学分）
          </span>
          <div className="gpa-goal-courses-actions">
            <button
              type="button"
              className="gpa-btn is-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="导入排课表页「导出当前课表 (.txt)」得到的文件，或任何含「课程名 + 学分」的清单"
            >
              导入课表 txt
            </button>
            <button
              type="button"
              className="gpa-btn is-ghost is-plan"
              onClick={handleImportFromPlans}
              disabled={!planImportable || importing}
              title={
                planImportable
                  ? `导入排课表里参与排课的 ${planSource.activeCards} 门课程${includeClassGroups && planSource.classGroups ? ` + ${planSource.classGroups} 个班级课表组` : ""}`
                  : "排课表里还没有参与排课的课程"
              }
            >
              {importing ? "导入中…" : "从排课表导入"}
            </button>
            <button type="button" className="gpa-btn is-ghost" onClick={() => setPasteOpen((open) => !open)}>
              {pasteOpen ? "收起批量粘贴" : "批量粘贴"}
            </button>
            <button type="button" className="gpa-btn is-ghost" onClick={onClearCourses} disabled={!goal.courses.length}>
              清空
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="gpa-goal-file-input"
              aria-label="导入课表 txt 文件"
              onChange={handleTxtFile}
            />
          </div>
        </div>

        <div className="gpa-goal-plan-row">
          <p className="gpa-goal-plan-hint">
            排课表：参与排课 {planSource.activeCards} 门
            {planSource.cards > planSource.activeCards ? `（另有 ${planSource.cards - planSource.activeCards} 张未参与排课）` : ""}
            {planSource.classGroups ? ` · 班级课表组 ${planSource.classGroups} 个` : ""}
            {planImportable ? "。" : (
              <>
                。还没可导入的课程，先到<Link to="/ca">排课表</Link>添加课程或调用班级课表。
              </>
            )}
          </p>
          {planSource.classGroups > 0 && (
            <label className="gpa-goal-plan-check" title="整班课表通常包含该班全部课程，导入后超过上限会按剩余名额截断">
              <input
                type="checkbox"
                checked={includeClassGroups}
                onChange={(event) => setIncludeClassGroups(event.target.checked)}
              />
              同时导入班级课表组（{planSource.classGroups} 个，可能课很多）
            </label>
          )}
        </div>

        {goal.courses.map((course) => (
          <GoalCourseRow
            key={course.id}
            name={course.name}
            credits={course.credits}
            code={course.code}
            onChange={(patch) => onUpdateCourse(course.id, patch)}
            onRemove={() => onRemoveCourse(course.id)}
          />
        ))}

        <div className="gpa-goal-course-row">
          <input
            className="gpa-input gpa-goal-course-name"
            value={formName}
            placeholder="课程名称（可空）"
            aria-label="新课程名称"
            onChange={(event) => setFormName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAdd();
            }}
          />
          <input
            className="gpa-input gpa-goal-course-credit"
            value={formCredit}
            inputMode="decimal"
            placeholder="学分"
            aria-label="新课程学分"
            onChange={(event) => setFormCredit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAdd();
            }}
          />
          <button type="button" className="gpa-btn is-primary" onClick={handleAdd}>
            添加
          </button>
        </div>

        {pasteOpen && (
          <>
            <textarea
              className="gpa-textarea gpa-goal-textarea"
              rows={4}
              value={pasteText}
              placeholder={"每行一门课：课程名 学分，或只写学分。\n例如：\n高等数学（下） 4\n大学物理 3\n2"}
              aria-label="批量粘贴待修课程"
              onChange={(event) => setPasteText(event.target.value)}
            />
            <div className="gpa-paste-actions">
              <button type="button" className="gpa-btn is-primary" onClick={handlePasteCourses} disabled={!pasteText.trim()}>
                解析并添加
              </button>
              <span className="gpa-hint">没写课程名也可以，按「课程1、课程2…」占位</span>
            </div>
          </>
        )}
      </div>

      {status && <p className="gpa-status">{status}</p>}

      {/* 结果 */}
      {!ready ? (
        <p className="gpa-goal-empty">
          填写「目标 GPA」「已修学分」（有成绩时再填已修 GPA），并至少添加一门待修课程后自动计算。
        </p>
      ) : plan ? (
        <div className="gpa-goal-result">
          <p className={plan.status === "ok" ? "gpa-goal-message" : "gpa-goal-message is-warn"}>{plan.message}</p>

          {plan.status === "ok" && (
            <>
              <div className="gpa-goal-metrics">
                <div>
                  <span>本学期需平均绩点</span>
                  <b>{formatGpa(plan.requiredAverage)}</b>
                </div>
                <div>
                  <span>需拿到学分绩点</span>
                  <b>{formatCredit(plan.neededCreditPoint)}</b>
                </div>
                <div>
                  <span>达标后 GPA</span>
                  <b>{plan.minimal.length ? formatGpa(plan.minimal[0].newGpa) : "—"}</b>
                </div>
                <div>
                  <span>全部 A 上限</span>
                  <b>{formatGpa(plan.maxGpa)}</b>
                </div>
              </div>

              <div className="gpa-goal-section-head">
                <span className="gpa-goal-subtitle">最低达标组合（再降一档就跌破目标）</span>
                <span className="gpa-hint">{plan.minimal.length} 种</span>
              </div>
              {plan.minimal.length === 0 ? (
                <p className="gpa-goal-empty">组合过多或预算受限，暂未列出最低组合；可提高目标 GPA 缩小范围。</p>
              ) : (
                <div className="gpa-goal-list">
                  {plan.minimal.slice(0, 12).map((combo, index) => (
                    <ComboRow key={`min-${index}`} combo={combo} courses={plan.courses} />
                  ))}
                  {plan.minimal.length > 12 && (
                    <p className="gpa-goal-more">…另有 {plan.minimal.length - 12} 种最低组合未展示</p>
                  )}
                </div>
              )}

              <div className="gpa-goal-section-head">
                <button type="button" className="gpa-btn is-ghost" onClick={() => setShowAll((open) => !open)}>
                  {showAll ? "收起全部组合" : "展开全部组合"}
                </button>
                <span className="gpa-hint">
                  共 {plan.totalCombos} 种{plan.totalTruncated ? "（计算量受限，仅统计到部分）" : ""}；
                  同学分课程可互换，组合只按等级多重集计一次
                </span>
              </div>
              {showAll && (
                <div className="gpa-goal-list">
                  {plan.samples.length === 0 ? (
                    <p className="gpa-goal-empty">没有其他组合（最低组合已是最优解）。</p>
                  ) : (
                    plan.samples.map((combo, index) => <ComboRow key={`all-${index}`} combo={combo} courses={plan.courses} />)
                  )}
                  {(plan.samplesTruncated || plan.totalCombos > plan.samples.length + plan.minimal.length) && (
                    <p className="gpa-goal-more">仅展示部分组合；提高目标 GPA 可减少组合数量。</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
