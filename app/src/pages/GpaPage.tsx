import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ExternalLink from "../components/ExternalLink";
import GpaGoalPanel from "../components/GpaGoalPanel";
import { coursesToRecords, useGpaState } from "../hooks/useGpaState";
import { usePlans } from "../plans/PlansContext";
import { loadCourseRecords } from "../services/courseLoader";
import { MAX_GOAL_COURSES } from "../services/gpaGoal";
import { buildGoalCoursesFromPlan } from "../services/planImport";
import { type GpaRow, computeGpa } from "../services/gpaCalc";
import {
  COURSE_KINDS,
  GRADE_TABLE,
  courseKindMeta,
  formatCredit,
  formatGpa,
  type CourseKind,
  type Grade,
} from "../services/gpaRules";
import { downloadGpaTxt } from "../services/gpaExport";
import { parseTranscriptText, type ParseResult } from "../services/transcriptParse";
import { APP_VERSION_GPA, APP_VERSION_HOME } from "../config";
import "./GpaPage.css";

/**
 * GpaPage —— 绩点计算页（/gpa）。
 *
 * 定位：按农大官方等级制规则计算「总 GPA / 必修课 GPA」，数据手工录入或从成绩单复制粘贴。
 *
 * 结构：
 * - 左栏：快速添加 → 批量粘贴解析 → 成绩表格（课程名/课程号/学分/等级/类型/计入/重修/绩点）；
 *   成绩表格下方是「目标 GPA 规划」卡（已修基线 + 本学期待修学分 → 反解所需等级组合）；
 * - 右栏：结果卡（总 GPA、必修 GPA、全部学期累计）→ 重修口径 → 学期管理 → 导出/清空 → 规则说明；
 * - 数据：hooks/useGpaState（localStorage 键 autumn-gpa-state，多学期分别存档）；
 * - 计算：services/gpaCalc（纯函数）+ services/gpaRules（官方等级对照表）；
 * - 解析：services/transcriptParse（粘贴文本按行解析，PDF 文件解析待后续接入）。
 */

const PASTE_PLACEHOLDER = `从教务系统「我的成绩」或电子成绩单中复制后粘贴到这里，一行一门课，例如：

202620271001357	高等数学（上）	5.0	A	4.0
202620271001358	大学物理	3.0	B+	3.3	必修
体育	1	通过

支持的列：课程号（可省）、课程名、学分、成绩（A+…F / 通过 / 不通过 / 免修 / 百分制分数）、绩点（可省）、附注（可省）`;

/** 单行成绩记录（受控草稿：课程名/学分在失焦时提交，避免半途清空导致数据丢失） */
function RecordRow({
  row,
  onChange,
  onRemove,
}: {
  row: GpaRow;
  onChange: (patch: Partial<Pick<GpaRow["record"], "name" | "code" | "credits" | "grade" | "kind" | "counted" | "retake">>) => void;
  onRemove: () => void;
}) {
  const record = row.record;
  const [nameDraft, setNameDraft] = useState(record.name);
  const [creditDraft, setCreditDraft] = useState(formatCredit(record.credits));

  // 记录被外部更新（粘贴导入/刷新恢复）时同步草稿
  useEffect(() => {
    setNameDraft(record.name);
  }, [record.name]);
  useEffect(() => {
    setCreditDraft(formatCredit(record.credits));
  }, [record.credits]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== record.name) onChange({ name: next });
    else setNameDraft(record.name);
  };

  const commitCredit = () => {
    const value = Number(creditDraft);
    if (Number.isFinite(value) && value > 0 && value <= 20) {
      if (Math.abs(value - record.credits) > 1e-9) onChange({ credits: Math.round(value * 10) / 10 });
      setCreditDraft(formatCredit(Math.round(value * 10) / 10));
    } else {
      setCreditDraft(formatCredit(record.credits));
    }
  };

  const kindMeta = courseKindMeta(record.kind);
  const canToggle = row.point !== null && kindMeta.countsInTotal && !row.note.startsWith("同一课程");

  return (
    <tr className={row.countedTotal ? "" : "is-excluded"}>
      <td className="gpa-col-name">
        <input
          className="gpa-cell-input"
          value={nameDraft}
          aria-label="课程名称"
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {record.retake && <span className="gpa-tag">重修</span>}
        {row.note && <div className="gpa-row-note">{row.note}</div>}
      </td>
      <td className="gpa-col-code">
        <input
          className="gpa-cell-input is-narrow"
          value={record.code}
          placeholder="可空"
          aria-label="课程号"
          onChange={(event) => onChange({ code: event.target.value.trim() })}
        />
      </td>
      <td className="gpa-col-credit">
        <input
          className="gpa-cell-input is-credit"
          value={creditDraft}
          inputMode="decimal"
          aria-label="学分"
          onChange={(event) => setCreditDraft(event.target.value)}
          onBlur={commitCredit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </td>
      <td className="gpa-col-grade">
        <select
          className="gpa-cell-select"
          value={record.grade}
          aria-label="成绩等级"
          onChange={(event) => onChange({ grade: event.target.value as Grade })}
        >
          {GRADE_TABLE.map((item) => (
            <option key={item.grade} value={item.grade}>
              {item.grade}
            </option>
          ))}
        </select>
      </td>
      <td className="gpa-col-kind">
        <select
          className="gpa-cell-select"
          value={record.kind}
          aria-label="课程类型"
          onChange={(event) => onChange({ kind: event.target.value as CourseKind })}
        >
          {COURSE_KINDS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </td>
      <td className="gpa-col-counted">
        <input
          type="checkbox"
          checked={row.countedTotal}
          disabled={!canToggle}
          aria-label="计入 GPA"
          title={canToggle ? "是否计入 GPA" : row.note || "该课程按规则不计入 GPA"}
          onChange={(event) => onChange({ counted: event.target.checked })}
        />
      </td>
      <td className="gpa-col-point">
        <span className={row.countedTotal ? "gpa-point is-on" : "gpa-point"}>
          {row.point === null ? "—" : row.point.toFixed(1)}
        </span>
      </td>
      <td className="gpa-col-op">
        <button type="button" className="gpa-icon-btn" aria-label={`删除 ${record.name}`} onClick={onRemove}>
          ×
        </button>
      </td>
    </tr>
  );
}

export default function GpaPage() {
  const {
    state,
    activeTerm,
    result,
    addRecord,
    addRecords,
    updateRecord,
    removeRecord,
    clearRecords,
    setRetakeRule,
    selectTerm,
    addTerm,
    renameTerm,
    removeTerm,
    newId,
    goal,
    updateGoal,
    addGoalCourses,
    updateGoalCourse,
    removeGoalCourse,
    clearGoalCourses,
  } = useGpaState();

  const [formName, setFormName] = useState("");
  const [formCredit, setFormCredit] = useState("");
  const [formGrade, setFormGrade] = useState<Grade>("A");
  const [formKind, setFormKind] = useState<CourseKind>("required");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteReport, setPasteReport] = useState<ParseResult | null>(null);
  const [status, setStatus] = useState("");
  const [termDraft, setTermDraft] = useState(activeTerm.name);

  useEffect(() => {
    document.title = "秋功-绩点计算";
  }, []);

  // 切换学期时同步学期名输入框；切走后清空粘贴报告
  useEffect(() => {
    setTermDraft(activeTerm.name);
    setPasteReport(null);
  }, [activeTerm.id, activeTerm.name]);

  // 状态提示 4 秒后自动消失
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  /** 全部学期累计（跨学期合并后按同一口径计算；同一课程跨学期重修同样去重） */
  const allTimeResult = useMemo(
    () => computeGpa(state.terms.flatMap((term) => term.records), state.retakeRule),
    [state.terms, state.retakeRule]
  );

  /** 排课表（PlansProvider）里可导入的课程来源规模 */
  const { planState } = usePlans();
  const planSource = useMemo(
    () => ({
      cards: planState.cards.length,
      activeCards: planState.cards.filter((card) => card.active).length,
      classGroups: planState.classGroups.filter((group) => group.active).length,
    }),
    [planState.cards, planState.classGroups]
  );

  /** 从排课表导入待修课程：课程编号回查通知单学分（按需加载课程数据） */
  const handleImportFromPlans = useCallback(
    async (options: { includeClassGroups: boolean }) => {
      const records = await loadCourseRecords();
      const imported = buildGoalCoursesFromPlan({
        cards: planState.cards,
        // 班级课表组是「整班占用」，课程多且多数与卡片重复，默认不导入
        classGroups: options.includeClassGroups ? planState.classGroups : [],
        records,
        existing: goal.courses,
      });

      // 组合枚举有课程数上限：超出部分先不导入，提示分批计算
      const capacity = Math.max(0, MAX_GOAL_COURSES - goal.courses.length);
      const accepted = imported.courses.slice(0, capacity);
      const overflow = imported.courses.length - accepted.length;
      if (accepted.length) addGoalCourses(accepted);

      const cardCodes = new Set(planState.cards.filter((card) => card.active).map((card) => card.courseCode.trim()));
      const fromCards = accepted.filter((course) => cardCodes.has(course.code)).length;
      const fromClasses = accepted.length - fromCards;

      const parts: string[] = [];
      parts.push(accepted.length ? `已从排课表导入 ${accepted.length} 门课程` : "没有新增课程");
      const sources: string[] = [];
      if (fromCards) sources.push(`卡片 ${fromCards} 门`);
      if (fromClasses) sources.push(`班级课表 ${fromClasses} 门`);
      if (sources.length) parts.push(`（${sources.join(" + ")}）`);
      if (overflow) parts.push(`；已达 ${MAX_GOAL_COURSES} 门上限，另有 ${overflow} 门未导入，可分批计算`);
      if (imported.duplicates) parts.push(`，跳过 ${imported.duplicates} 门已在清单里的课程`);
      if (imported.inactiveCards) parts.push(`，跳过 ${imported.inactiveCards} 张未参与排课的卡片`);
      if (imported.missing.length) {
        const names = imported.missing.slice(0, 3).map((item) => item.name).join("、");
        parts.push(`，${imported.missing.length} 门在通知单里找不到学分：${names}${imported.missing.length > 3 ? " 等" : ""}`);
      }
      return { added: accepted.length, message: parts.join("") };
    },
    [planState.cards, planState.classGroups, goal.courses, addGoalCourses]
  );

  const handleQuickAdd = () => {
    const name = formName.trim();
    const credits = Number(formCredit);
    if (!name) {
      setStatus("请先填写课程名称");
      return;
    }
    if (!Number.isFinite(credits) || credits <= 0 || credits > 20) {
      setStatus("学分需为 0.5–20 之间的数字");
      return;
    }
    const rounded = Math.round(credits * 10) / 10;
    addRecord({
      id: newId(),
      code: "",
      name,
      credits: rounded,
      grade: formGrade,
      kind: formKind,
      counted: courseKindMeta(formKind).countsInTotal && GRADE_TABLE.find((item) => item.grade === formGrade)?.counted === true,
      retake: false,
    });
    setFormName("");
    setFormCredit("");
    setStatus(`已添加「${name}」`);
  };

  const handleParse = () => {
    if (!pasteText.trim()) return;
    const parsed = parseTranscriptText(pasteText);
    if (parsed.courses.length === 0) {
      setPasteReport(parsed);
      setStatus("没有识别到可导入的课程，请检查文本格式");
      return;
    }
    addRecords(coursesToRecords(parsed.courses));
    setPasteReport(parsed);
    setPasteText("");
    setStatus(`已导入 ${parsed.courses.length} 门课程${parsed.skipped.length ? `，跳过 ${parsed.skipped.length} 行` : ""}`);
  };

  const handleExport = () => {
    const summary = downloadGpaTxt({
      termName: activeTerm.name,
      result,
      retakeRule: state.retakeRule,
    });
    setStatus(`已导出 ${summary.count} 门课程（总 GPA ${summary.gpa}）`);
  };

  const handleClear = () => {
    if (!activeTerm.records.length) return;
    if (!window.confirm(`确定清空「${activeTerm.name}」的 ${activeTerm.records.length} 条成绩？此操作不可撤销。`)) return;
    clearRecords();
    setStatus("已清空当前学期成绩");
  };

  return (
    <div className="gpa-page layout-page">
      {/* 顶部导航栏 */}
      <div className="header primary-bg">
        <div className="container">
          <div className="logo">秋功-农大工具站</div>
          <div className="nav-list">
            <div className="nav-item">
              <Link to="/">首页</Link>
            </div>
            <div className="nav-item">
              <Link to="/qbn">题库</Link>
            </div>
            <div className="nav-item">
              <Link to="/resources">学习资料</Link>
            </div>
            <div className="nav-item">
              <Link to="/gpa">绩点计算</Link>
            </div>
            <div className="nav-item">联系作者</div>
          </div>
        </div>
      </div>

      <main className="main container">
        {/* 左栏：录入 */}
        <div className="left-box">
          <div className="surface-card gpa-input-card">
            <div className="title-bar">
              <span className="title">成绩录入</span>
              <span className="gpa-term-tag">{activeTerm.name}</span>
            </div>

            {/* 快速添加一行 */}
            <div className="gpa-add-row">
              <input
                className="gpa-input is-name"
                value={formName}
                placeholder="课程名称，如：高等数学（上）"
                aria-label="课程名称"
                onChange={(event) => setFormName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleQuickAdd();
                }}
              />
              <input
                className="gpa-input is-credit"
                value={formCredit}
                inputMode="decimal"
                placeholder="学分"
                aria-label="学分"
                onChange={(event) => setFormCredit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleQuickAdd();
                }}
              />
              <select
                className="gpa-select"
                value={formGrade}
                aria-label="成绩等级"
                onChange={(event) => setFormGrade(event.target.value as Grade)}
              >
                {GRADE_TABLE.map((item) => (
                  <option key={item.grade} value={item.grade}>
                    {item.grade}
                  </option>
                ))}
              </select>
              <select
                className="gpa-select"
                value={formKind}
                aria-label="课程类型"
                onChange={(event) => setFormKind(event.target.value as CourseKind)}
              >
                {COURSE_KINDS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button type="button" className="gpa-btn is-primary" onClick={handleQuickAdd}>
                添加
              </button>
            </div>

            {/* 批量粘贴导入 */}
            <div className="gpa-paste">
              <div className="gpa-paste-head">
                <span className="gpa-paste-title">批量粘贴导入</span>
                <button type="button" className="gpa-btn is-ghost" onClick={() => setPasteOpen((open) => !open)}>
                  {pasteOpen ? "收起" : "展开"}
                </button>
              </div>
              {pasteOpen && (
                <>
                  <textarea
                    className="gpa-textarea"
                    value={pasteText}
                    rows={8}
                    placeholder={PASTE_PLACEHOLDER}
                    aria-label="粘贴成绩文本"
                    onChange={(event) => setPasteText(event.target.value)}
                  />
                  <div className="gpa-paste-actions">
                    <button type="button" className="gpa-btn is-primary" onClick={handleParse} disabled={!pasteText.trim()}>
                      解析并添加
                    </button>
                    <span className="gpa-hint">
                      支持成绩单 / 教务系统复制的多行文本；百分制分数按官方区间换算为等级
                    </span>
                  </div>
                  {pasteReport && (
                    <div className="gpa-report">
                      <p>
                        识别 <b>{pasteReport.courses.length}</b> 门课程
                        {pasteReport.skipped.length > 0 && `，跳过 ${pasteReport.skipped.length} 行`}
                        {pasteReport.courses.length > 0 && "（已加入当前学期）"}
                      </p>
                      {pasteReport.skipped.length > 0 && (
                        <ul className="gpa-skip-list">
                          {pasteReport.skipped.slice(0, 6).map((item, index) => (
                            <li key={`${index}-${item.raw.slice(0, 12)}`}>
                              <span className="gpa-skip-raw">{item.raw.slice(0, 48)}</span>
                              <span className="gpa-skip-reason">{item.reason}</span>
                            </li>
                          ))}
                          {pasteReport.skipped.length > 6 && <li>…另有 {pasteReport.skipped.length - 6} 行未显示</li>}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {status && <p className="gpa-status">{status}</p>}

            {/* 成绩表格 */}
            {result.rows.length === 0 ? (
              <p className="gpa-empty">
                还没有成绩。可以上面逐门添加，或展开「批量粘贴导入」把成绩单文字整段粘进来。
                <br />
                示例：<code>高等数学（上） 5 A</code>
              </p>
            ) : (
              <div className="gpa-table-wrap">
                <table className="gpa-table">
                  <thead>
                    <tr>
                      <th className="gpa-col-name">课程</th>
                      <th className="gpa-col-code">课程号</th>
                      <th className="gpa-col-credit">学分</th>
                      <th className="gpa-col-grade">等级</th>
                      <th className="gpa-col-kind">类型</th>
                      <th className="gpa-col-counted">计入</th>
                      <th className="gpa-col-point">绩点</th>
                      <th className="gpa-col-op" aria-label="操作" />
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <RecordRow
                        key={row.record.id}
                        row={row}
                        onChange={(patch) => updateRecord(row.record.id, patch)}
                        onRemove={() => removeRecord(row.record.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 目标 GPA 规划：已修基线 + 本学期待修学分 → 反解需要的等级组合 */}
          <GpaGoalPanel
            goal={goal}
            allTimeGpa={allTimeResult.total.gpa}
            allTimeCredits={allTimeResult.total.credits}
            planSource={planSource}
            onImportFromPlans={handleImportFromPlans}
            onUpdateGoal={updateGoal}
            onAddCourses={addGoalCourses}
            onUpdateCourse={updateGoalCourse}
            onRemoveCourse={removeGoalCourse}
            onClearCourses={clearGoalCourses}
          />
        </div>

        {/* 右栏：结果与设置 */}
        <div className="right-box">
          <div className="surface-card gpa-summary-card">
            <div className="gpa-metric-label">总 GPA</div>
            <div className={result.total.gpa === null ? "gpa-big is-empty" : "gpa-big"}>
              {formatGpa(result.total.gpa)}
            </div>
            <div className="gpa-metric-sub">
              计入 {result.total.courses} 门 · 学分合计 {formatCredit(result.total.credits)}
            </div>
            <div className="gpa-metrics">
              <div>
                <span>必修课 GPA</span>
                <b>{formatGpa(result.required.gpa)}</b>
              </div>
              <div>
                <span>未计入</span>
                <b>{result.excluded} 门</b>
              </div>
              <div>
                <span>本页课程</span>
                <b>{activeTerm.records.length} 门</b>
              </div>
              <div>
                <span>全部学期累计</span>
                <b>{formatGpa(allTimeResult.total.gpa)}</b>
              </div>
            </div>
          </div>

          <div className="surface-card gpa-panel">
            <div className="gpa-panel-title">重修口径</div>
            <div className="gpa-seg" role="group" aria-label="重修成绩取用口径">
              <button
                type="button"
                className={state.retakeRule === "best" ? "is-active" : ""}
                onClick={() => setRetakeRule("best")}
              >
                成绩单口径（取最高）
              </button>
              <button
                type="button"
                className={state.retakeRule === "first" ? "is-active" : ""}
                onClick={() => setRetakeRule("first")}
              >
                排名口径（取首次）
              </button>
            </div>
            <p className="gpa-hint">
              同一门课程（课程号一致，无课程号时按课程名）多次修读时，两种口径结果不同：成绩单取最高一次，排名取首次修读。
            </p>
          </div>

          <div className="surface-card gpa-panel">
            <div className="gpa-panel-title">学期</div>
            <select
              className="gpa-select is-block"
              value={activeTerm.id}
              aria-label="选择学期"
              onChange={(event) => selectTerm(event.target.value)}
            >
              {state.terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}（{term.records.length} 门）
                </option>
              ))}
            </select>
            <div className="gpa-term-row">
              <input
                className="gpa-input"
                value={termDraft}
                aria-label="学期名称"
                onChange={(event) => setTermDraft(event.target.value)}
                onBlur={() => renameTerm(activeTerm.id, termDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <button type="button" className="gpa-btn" onClick={addTerm}>
                新建学期
              </button>
            </div>
            <button
              type="button"
              className="gpa-btn is-block"
              disabled={state.terms.length <= 1}
              onClick={() => removeTerm(activeTerm.id)}
            >
              删除当前学期
            </button>
          </div>

          <div className="surface-card gpa-panel">
            <div className="gpa-panel-title">导出</div>
            <button
              type="button"
              className="gpa-btn is-primary is-block"
              disabled={result.rows.length === 0}
              onClick={handleExport}
            >
              导出绩点清单 (.txt)
            </button>
            <button
              type="button"
              className="gpa-btn is-block is-danger"
              disabled={activeTerm.records.length === 0}
              onClick={handleClear}
            >
              清空当前学期成绩
            </button>
            <p className="gpa-hint">数据保存在本机浏览器（localStorage），清理浏览器数据会一并清除。</p>
          </div>

          <div className="surface-card gpa-rules">
            <div className="gpa-panel-title">计算规则</div>
            <p className="gpa-rule-line">
              GPA = ∑（课程绩点 × 学分）÷ ∑学分，结果四舍五入保留 2 位小数。
            </p>
            <ul className="gpa-rule-list">
              <li>普通通识课、核心通识课与 EX / P / N 成绩不纳入计算；</li>
              <li>学校按「必修课 GPA」与「总 GPA」两种方式评定学业表现；</li>
              <li>同一课程重修：成绩单口径取最高成绩，排名口径取首次修读；</li>
              <li>本校成绩单只显示等级，不提供百分制平均分。</li>
            </ul>
            <div className="gpa-grade-chips">
              {GRADE_TABLE.map((item) => (
                <span
                  key={item.grade}
                  className={item.counted ? "gpa-grade-chip" : "gpa-grade-chip is-off"}
                  title={`${item.grade}：${item.range}${item.point === null ? "，不计入 GPA" : `，绩点 ${item.point.toFixed(1)}`}`}
                >
                  <b>{item.grade}</b>
                  <span>{item.point === null ? "不计" : item.point.toFixed(1)}</span>
                </span>
              ))}
            </div>
            <p className="gpa-source">
              依据：
              <ExternalLink href="https://bksy.cau.edu.cn/art/2026/7/7/art_41139_1121669.html">
                本科生院《成绩记载、查询与复核全规则解读》
              </ExternalLink>
              （中农大教字〔2022〕5 号第十五条）与
              <ExternalLink href="https://bksy.cau.edu.cn/art/2026/7/16/art_41139_1122721.html">
                《成绩单显示与绩点计算规则》
              </ExternalLink>
              。
            </p>
            <p className="gpa-disclaimer">本工具为辅助计算，最终以教务系统成绩单为准。</p>
          </div>
        </div>
      </main>

      {/* 页脚 */}
      <div className="footer primary-bg text-white text-center">
        <div className="container">
          <p>
            绩点计算工具 v{APP_VERSION_GPA} · 秋功 v{APP_VERSION_HOME}
          </p>
        </div>
      </div>
    </div>
  );
}
