import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ExternalLink from "../components/ExternalLink";
import { CAU_GPA_RULES_URL } from "../config";
import { calculateGpa, calculateGpaTarget, calculateExamTarget, ceilTarget, formatGpa, parseBands, readNumber } from "../services/gpa";
import type { GpaCourse } from "../services/gpa";
import { blankCourse, defaultGpaState, GPA_STORAGE_KEY, restoreGpaState } from "../services/gpaStorage";
import type { GpaState } from "../services/gpaStorage";
import "./GpaPage.css";

function loadState() {
  try {
    const raw = localStorage.getItem(GPA_STORAGE_KEY);
    const restored = raw ? restoreGpaState(raw) : null;
    return { state: restored ?? defaultGpaState(), notice: raw && !restored ? "本机记录无法读取，已使用空白表格。" : "" };
  } catch { return { state: defaultGpaState(), notice: "本机存储不可用，离开页面前请导出结果。" }; }
}

function NumberField({ label, value, onChange, placeholder, suffix }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; suffix?: string;
}) {
  return <label className="gpa-field"><span>{label}</span><span className="gpa-input-wrap">
    <input aria-label={label} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={16} />
    {suffix && <span className="gpa-unit">{suffix}</span>}
  </span></label>;
}

export default function GpaPage() {
  const [initial] = useState(loadState);
  const [state, setState] = useState<GpaState>(initial.state);
  const [notice, setNotice] = useState(initial.notice);
  const [saveFailed, setSaveFailed] = useState(false);
  const [undo, setUndo] = useState<GpaCourse[] | null>(null);
  const [tab, setTab] = useState<"gpa" | "exam">("gpa");
  const patch = (value: Partial<GpaState>) => setState((prev) => ({ ...prev, ...value }));

  useEffect(() => { document.title = "秋功-绩点与目标成绩计算器"; }, []);
  useEffect(() => {
    try { localStorage.setItem(GPA_STORAGE_KEY, JSON.stringify(state)); setSaveFailed(false); }
    catch { setSaveFailed(true); }
  }, [state]);

  const scale = readNumber(state.scale, 0.1, 10);
  const rules = useMemo(() => parseBands(state.bands, scale ?? 4), [state.bands, scale]);
  const ruleValid = scale !== null && (state.mode === "points" || !rules.error);
  const summary = useMemo(() => calculateGpa(state.courses, state.mode, scale ?? 4, rules.bands), [state.courses, state.mode, scale, rules.bands]);
  const maxPoints = state.mode === "percent" ? (rules.bands.at(-1)?.points ?? 0) : (scale ?? 4);
  const currentCredits = state.baseline === "courses" ? summary.credits : readNumber(state.currentCredits, 0, 10000);
  const currentGpa = currentCredits === 0 ? 0 : state.baseline === "courses" ? summary.gpa : readNumber(state.currentGpa, 0, scale ?? 4);
  const remainingCredits = readNumber(state.remainingCredits, 0, 10000);
  const targetGpa = readNumber(state.targetGpa, 0, scale ?? 4);
  const baselineValid = state.baseline === "summary" || (!summary.invalidCount && !summary.incompleteCount);
  const target = ruleValid && baselineValid && currentCredits !== null && currentGpa !== null && remainingCredits !== null && remainingCredits > 0 && targetGpa !== null
    ? calculateGpaTarget(currentCredits, state.baseline === "courses" ? summary.weightedPoints : currentCredits * currentGpa, remainingCredits, targetGpa, maxPoints) : null;
  const regular = readNumber(state.regularScore, 0, 100);
  const weight = readNumber(state.examWeight, 0, 100);
  const total = readNumber(state.targetScore, 0, 100);
  const exam = regular !== null && weight !== null && total !== null ? calculateExamTarget(regular, weight, total) : null;

  function updateCourse(id: string, value: Partial<GpaCourse>) {
    setUndo(null);
    setState((prev) => ({ ...prev, courses: prev.courses.map((course) => course.id === id ? { ...course, ...value } : course) }));
  }
  function replaceCourses(courses: GpaCourse[]) {
    setUndo(state.courses);
    patch({ courses });
  }
  function showExample() {
    replaceCourses([
      { ...blankCourse(), name: "示例·高等数学", code: "demo-01", credits: "4", grade: "3.7", score: "88" },
      { ...blankCourse(), name: "示例·大学英语", code: "demo-02", credits: "2", grade: "3.3", score: "83" },
      { ...blankCourse(), name: "示例·实践课程", credits: "1", grade: "P", score: "P" },
    ]);
    setNotice("已载入示例课程，可撤销恢复原表格。示例分数不代表学校换算规则。");
  }
  function exportResult() {
    const lines = ["秋功 · 绩点与目标成绩计算", `计算方式：${state.mode === "points" ? "成绩单绩点" : "自定义百分制换算"}`, `绩点满分：${state.scale}`,
      ...summary.rows.map((row) => `${row.course.name || "未命名课程"} | 编号 ${row.course.code || "未填"} | ${row.course.credits || "未填"} 学分 | 成绩 ${state.mode === "points" ? row.course.grade : row.course.score} | 绩点 ${row.points ?? "—"} | ${row.message}`),
      `有效课程：${summary.count} 门，计入学分：${summary.credits}，加权 GPA：${ruleValid ? (summary.gpa === null ? "无" : formatGpa(summary.gpa)) : "规则无效"}`,
      `未完成：${summary.incompleteCount} 门；输入错误：${summary.invalidCount} 门（上述课程未计入）`];
    if (state.mode === "percent") lines.push("自定义换算规则（最低分=绩点）：", state.bands);
    if (target) lines.push(`目标 GPA：${state.targetGpa}；已有 ${currentCredits} 学分，GPA ${currentGpa}；剩余 ${remainingCredits} 学分`,
      `剩余所需平均绩点：${ceilTarget(Math.max(0, target.required), 3)}；最高可达 GPA：${target.highest.toFixed(3)}；${target.status === "impossible" ? "目标超出当前可达范围" : "目标在理论可达范围内"}`);
    if (exam) lines.push(`期末反推：平时 ${regular} 分，期末占 ${weight}%，目标总评 ${total} 分；${exam.required === null ? "期末不计入总评" : `期末需要 ${ceilTarget(Math.max(0, exam.required), 2)} 分`}；${exam.status === "impossible" ? "目标不可达" : "理论可达"}`);
    lines.push("按当前输入估算；课程是否计入及成绩口径请核对个人成绩单。", CAU_GPA_RULES_URL);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "秋功_绩点与目标成绩.txt";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("计算结果已导出。");
  }

  return <>
    <div className="gpa-page">
      <header className="gpa-header"><div className="gpa-container gpa-header-inner">
        <Link to="/" className="gpa-brand">秋功<span>农大工具站</span></Link>
        <nav aria-label="工具导航"><Link to="/">首页</Link><Link to="/ca">排课表</Link><Link to="/gpa" aria-current="page">绩点计算</Link><Link to="/resources">学习资料</Link></nav>
      </div></header>
      <main className="gpa-container gpa-main">
        <div className="gpa-intro"><div><p className="gpa-eyebrow">学习规划 / 成绩测算</p><h1>绩点与目标成绩计算器</h1><p>算清当前的位置，也看看下一步需要多少分。</p></div>
          <span className={`gpa-save ${saveFailed ? "is-error" : ""}`}>{saveFailed ? "本机保存失败，请导出备份" : "仅本机保存 · 无需登录"}</span>
        </div>
        <div className="gpa-tabs" role="group" aria-label="选择计算工具">
          <button type="button" aria-pressed={tab === "gpa"} onClick={() => setTab("gpa")}>绩点与累计目标</button>
          <button type="button" aria-pressed={tab === "exam"} onClick={() => setTab("exam")}>期末需要考多少分</button>
        </div>
        {notice && <div className="gpa-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}

        {tab === "gpa" ? <>
          <section className="gpa-card gpa-rule-card" aria-labelledby="gpa-rule-title">
            <div><h2 id="gpa-rule-title">计算口径</h2><p className="gpa-muted">优先填写成绩单上的课程绩点。百分制与绩点输入分别保存，切换不会混用。</p></div>
            <div className="gpa-rule-inputs"><label className="gpa-field"><span>成绩录入方式</span><select aria-label="成绩录入方式" value={state.mode} onChange={(e) => patch({ mode: e.target.value as GpaState["mode"] })}>
              <option value="points">直接填写绩点</option><option value="percent">百分制 · 自定义换算</option>
            </select></label><NumberField label="绩点满分" value={state.scale} onChange={(scale) => patch({ scale })} /></div>
            {scale === null && <p className="gpa-error" role="alert">绩点满分须为 0.1–10。</p>}
            {state.mode === "percent" && <details className="gpa-rules" open>
              <summary>自定义换算表 · 初始值仅为示例</summary>
              <div className="gpa-rules-inner"><label className="gpa-field"><span>每行填写：最低分=绩点</span><textarea aria-label="自定义换算规则" rows={6} value={state.bands} onChange={(e) => patch({ bands: e.target.value })} maxLength={2000} spellCheck={false} /></label>
                <div><p>达到某档最低分、未达到下一档时，使用该档绩点。请按你的实际规则修改；这不是农大官方百分制换算表。</p><p>例如：85=3.7，90=4，表示 85 分起为 3.7，90 分起为 4。</p>{rules.error && <p className="gpa-error" role="alert">{rules.error}</p>}</div></div>
            </details>}
          </section>
          <div className="gpa-layout">
            <section className="gpa-card gpa-course-card" aria-labelledby="gpa-courses-title">
              <div className="gpa-section-head"><div><h2 id="gpa-courses-title">我的课程</h2><p className="gpa-muted">填写学分和{state.mode === "points" ? "绩点" : "分数"}，结果实时更新。</p></div><button className="gpa-text-btn" type="button" onClick={showExample}>试填示例</button></div>
              <div className="gpa-stats" aria-live="polite"><div><span>当前加权 GPA</span><strong>{ruleValid ? (summary.gpa === null ? "—" : formatGpa(summary.gpa)) : "—"}</strong><small>按有效且计入的课程</small></div><div><span>计入学分</span><strong>{summary.credits.toFixed(1)}</strong><small>{summary.count} 门课程</small></div></div>
              <div className="gpa-table-wrap"><table className="gpa-table"><caption className="gpa-sr-only">课程成绩明细</caption><thead><tr><th>计入</th><th>课程 / 编号（选填）</th><th>学分</th><th>{state.mode === "points" ? "绩点" : "分数"}</th><th>计入情况</th><th><span className="gpa-sr-only">操作</span></th></tr></thead>
                <tbody>{summary.rows.map((row, index) => <tr key={row.course.id} className={row.status === "excluded" || row.status === "retake" ? "is-excluded" : ""}>
                  <td><input type="checkbox" aria-label={`第${index + 1}门课计入`} checked={row.course.included} onChange={(e) => updateCourse(row.course.id, { included: e.target.checked })} /></td>
                  <td><input aria-label={`第${index + 1}门课名称`} placeholder="课程名称" value={row.course.name} maxLength={80} onChange={(e) => updateCourse(row.course.id, { name: e.target.value })} /><input className="gpa-code" aria-label={`第${index + 1}门课编号`} placeholder="编号用于识别重修" value={row.course.code} maxLength={40} onChange={(e) => updateCourse(row.course.id, { code: e.target.value })} /></td>
                  <td><input aria-label={`第${index + 1}门课学分`} inputMode="decimal" placeholder="如 3" value={row.course.credits} maxLength={12} onChange={(e) => updateCourse(row.course.id, { credits: e.target.value })} /></td>
                  <td><input aria-label={`第${index + 1}门课${state.mode === "points" ? "绩点" : "分数"}`} aria-invalid={row.status === "invalid"} placeholder={state.mode === "points" ? "如 3.7" : "如 85"} value={state.mode === "points" ? row.course.grade : row.course.score} maxLength={12} onChange={(e) => updateCourse(row.course.id, state.mode === "points" ? { grade: e.target.value } : { score: e.target.value })} /></td>
                  <td><span className={row.status === "invalid" ? "gpa-error" : "gpa-row-status"}>{row.message}</span>{state.mode === "percent" && row.points !== null && <small>绩点 {row.points.toFixed(2)}</small>}</td>
                  <td><button className="gpa-remove" type="button" aria-label={`删除第${index + 1}门课`} onClick={() => replaceCourses(state.courses.filter((course) => course.id !== row.course.id))}>×</button></td>
                </tr>)}</tbody></table></div>
              {!state.courses.length && <p className="gpa-empty">还没有课程，添加一门开始计算。</p>}
              <div className="gpa-actions"><button type="button" className="gpa-btn" disabled={state.courses.length >= 200} onClick={() => { setUndo(null); patch({ courses: [...state.courses, blankCourse()] }); }}>＋ 添加课程</button>
                {undo && <button type="button" className="gpa-text-btn" onClick={() => { patch({ courses: undo }); setUndo(null); setNotice("已恢复上一次课程表格。"); }}>撤销表格替换 / 删除</button>}
                <button type="button" className="gpa-text-btn" disabled={!state.courses.length} onClick={() => replaceCourses([])}>清空表格</button>
              </div>
              {(summary.invalidCount > 0 || summary.incompleteCount > 0) && <p className="gpa-muted" role="status">{summary.incompleteCount} 门待填写，{summary.invalidCount} 门输入有误，暂未计入上方结果。补齐或取消计入后才能使用明细反推目标。</p>}
              <details className="gpa-help"><summary>哪些课程计入？重修怎么算？</summary><p>可填写 P、N、EX，系统会自动排除。相同非空课程编号只取最高绩点；编号留空时各行独立计算。课程替代、通识等特殊情况请按个人成绩单取消“计入”。这里计算成绩单口径，不用于排名 GPA。</p>
                <ExternalLink href={CAU_GPA_RULES_URL}>本科生院规则说明（2026-07-16）</ExternalLink></details>
            </section>

            <aside className="gpa-card gpa-target" aria-labelledby="gpa-target-title">
              <p className="gpa-eyebrow">下一步的目标</p><h2 id="gpa-target-title">目标 GPA，需要多少？</h2><p className="gpa-muted">按剩余课程全部计入 GPA 计算。</p>
              <label className="gpa-field"><span>已有成绩来源</span><select aria-label="已有成绩来源" value={state.baseline} onChange={(e) => patch({ baseline: e.target.value as GpaState["baseline"] })}><option value="courses">使用左侧课程明细</option><option value="summary">手动填写已有 GPA 和学分</option></select></label>
              {state.baseline === "summary" ? <div className="gpa-two-fields"><NumberField label="已有计入学分" value={state.currentCredits} onChange={(currentCredits) => patch({ currentCredits })} placeholder="如 60" /><NumberField label="已有 GPA" value={state.currentGpa} onChange={(currentGpa) => patch({ currentGpa })} placeholder="如 3.2" /></div> : <p className="gpa-baseline">当前：{summary.credits.toFixed(1)} 学分 · GPA {(summary.gpa === null ? "—" : formatGpa(summary.gpa))}</p>}
              <div className="gpa-two-fields"><NumberField label="剩余计入学分" value={state.remainingCredits} onChange={(remainingCredits) => patch({ remainingCredits })} placeholder="如 20" /><NumberField label="目标累计 GPA" value={state.targetGpa} onChange={(targetGpa) => patch({ targetGpa })} placeholder="如 3.5" /></div>
              {target ? <div className={`gpa-result ${target.status === "impossible" ? "is-unreachable" : ""}`} aria-live="polite">
                <span>剩余课程所需加权平均绩点</span><strong>{target.status === "secured" ? "0.000" : ceilTarget(target.required, 3)}</strong>
                <p>{target.status === "impossible" ? "超出当前规则的最高绩点。可调整目标，或重新规划计入课程。" : target.status === "secured" ? "在所填剩余学分均计入的前提下，即使其绩点为 0，也能达到目标。" : "这是剩余课程整体的加权目标，每门课程可以取得不同成绩。"}</p>
                <div className="gpa-result-bottom">剩余课程全部满绩点时，累计最高约 <b>{target.highest.toFixed(3)}</b></div>
              </div> : <div className="gpa-result gpa-result-empty"><span>等待完整输入</span><p>{!ruleValid ? "请先修正计算规则。" : !baselineValid ? "请补齐左侧课程，或改用手动填写已有 GPA。" : "请填写有效的已有成绩、剩余学分（大于 0）与目标 GPA；学分不超过 10000，GPA 不超过设定满分。"}</p></div>}
              <details className="gpa-help"><summary>查看计算公式与精度</summary><p>所需平均绩点 = [目标 GPA ×（已有学分 + 剩余学分）− 已有学分绩点总和] ÷ 剩余学分。</p><p>课程 GPA 展示两位小数；目标向上取三位小数，计算过程不提前舍入。手填已舍入的 GPA 会产生估算误差。此处是新增课程测算，重修请在课程明细中修改成绩后比较。</p></details>
            </aside>
          </div>
        </> : <section className="gpa-card gpa-exam" aria-labelledby="gpa-exam-title">
          <div><p className="gpa-eyebrow">单门课程 / 百分制</p><h2 id="gpa-exam-title">期末需要考多少分？</h2><p className="gpa-muted">将作业、测验、出勤等先合成为平时成绩，再按课程公布的权重计算。</p>
            <div className="gpa-exam-fields"><NumberField label="平时成绩" value={state.regularScore} onChange={(regularScore) => patch({ regularScore })} placeholder="如 85" suffix="分" /><NumberField label="期末成绩占比" value={state.examWeight} onChange={(examWeight) => patch({ examWeight })} suffix="%" /><NumberField label="目标总评成绩" value={state.targetScore} onChange={(targetScore) => patch({ targetScore })} placeholder="如 90" suffix="分" /></div>
            <p className="gpa-muted">成绩与占比均为 0–100；平时成绩占比为 {weight === null ? "—" : 100 - weight}%。</p>
          </div>
          <div>{exam ? <div className={`gpa-result ${exam.status === "impossible" ? "is-unreachable" : ""}`} aria-live="polite"><span>期末卷面至少需要</span><strong>{exam.required === null ? "不计入" : `${ceilTarget(Math.max(0, exam.required), 2)} 分`}</strong><p>{exam.status === "impossible" ? "按当前权重，即使期末满分也无法达到目标。" : exam.status === "secured" ? "按加权公式，已达到目标所需的总评分数。" : `如果期末只记整数分，至少需要 ${ceilTarget(exam.required!, 0)} 分。`}</p><div className="gpa-result-bottom">按当前平时成绩，总评最高 {exam.highest.toFixed(2)} 分</div></div> : <div className="gpa-result gpa-result-empty"><span>填写成绩，开始反推</span><p>请填写 0–100 之间的成绩和期末占比。</p></div>}
            <p className="gpa-exam-note">总评 = 平时成绩 × 平时占比 + 期末成绩 × 期末占比。课程如有“期末必须及格”等独立要求，仍需同时满足。</p>
          </div>
        </section>}
        <footer className="gpa-footer"><p>输入自动保存在当前浏览器，清理浏览器数据会删除记录。</p><button type="button" className="gpa-btn" onClick={exportResult}>导出计算结果 (.txt)</button></footer>
      </main>
    </div>
  </>;
}
