import { useEffect, useState } from "react";
import FloatingChrome from "../components/FloatingChrome";
import SearchBar from "../components/SearchBar";
import CourseCardPool from "../components/CourseCardPool";
import TimetableGrid from "../components/TimetableGrid";
import PlanGeneratorPanel from "../components/PlanGeneratorPanel";
import ClassGroupSection from "../components/ClassGroupSection";
import { useCourseData } from "../hooks/useCourseData";
import { usePlanPool } from "../hooks/usePlanPool";
import { useTimetable } from "../hooks/useTimetable";
import { usePlanGenerator } from "../hooks/usePlanGenerator";
import { useClassGroups } from "../hooks/useClassGroups";
import { usePlans } from "../plans/PlansContext";
import { useSettings } from "../settings/SettingsContext";
import { APP_VERSION_CA } from "../config";
import type { CourseCandidate } from "../services/courseData";
import { findClassTimetableCandidates, findCourseCandidates } from "../services/courseData";
import "./CaBetaPage.css";

/**
 * CaBetaPage —— 排课表工具（原生 React 版，正式路由 /ca）。
 *
 * 功能模块（plan / class 双模式与原站对齐）：
 * - 课程检索 + 建议列表（SearchBar 组件，忠实还原原交互：50 条上限、
 *   加载中提示、无匹配提示、点击外部收起、清除按钮）；
 * - 班级检索（同组件复用）；
 * - 候选课程卡片池（CourseCardPool + usePlanPool）：卡片增删、参与排课开关、
 *   教师/校区筛选维度，options 恢复时从课程数据重建（与原站语义一致）；
 * - 用户设置接口演示：排课模式 / 校区偏好经 SettingsProvider 持久化；
 * - 方案状态接口：候选池经 PlanProvider 持久化（预留 ownerId 用户维度，
 *   接入后端后按登录用户隔离，换 RemotePlanProvider 即可）；
 * - 课表网格（TimetableGrid + useTimetable + scheduleParse）：6 大节 × 7 天、
 *   周次定位持久化、冲突检测/高亮（忠实移植原站解析与冲突语义）；
 * - 方案生成（PlanGeneratorPanel + usePlanGenerator + planGenerator）：
 *   四维筛选 + 校区偏好 + 阻塞时段回溯枚举（无冲突/冲突方案各至多 20 套），
 *   pills 切换激活方案、网格显示所选方案；时间段偏好编辑模式（点格子/行/列头
 *   设置阻塞）与原站一致；未生成时网格走过渡预览（点块循环切换教学班）；
 * - 班级课表组（ClassGroupSection + useClassGroups）：class 模式班级组池
 *   （整班选中/单门排除/全选/一键清除）、plan 模式课程组（方案生成固定占用）、
 *   「复制到方案排课」打通两种模式；组课程列表恢复时按班级名从课程数据重建。
 *
 * 路由说明：/ca-beta 重定向至此；原遗留挂载退至 /ca-legacy（无入口，回滚兜底）。
 */

const SIDEBAR_LINKS = [
  { to: "/", label: "本站首页" },
  { to: "/ca", label: "排课表工具" },
  { to: "/qbn", label: "题库" },
];

const CAMPUS_LABEL = { none: "无", east: "东校区", west: "西校区" } as const;
const CAMPUS_CYCLE = ["none", "east", "west"] as const;

export default function CaBetaPage() {
  const { courses, loading, error } = useCourseData();
  const { settings, ready, updateSettings } = useSettings();
  const pool = usePlanPool(courses);
  const classGroups = useClassGroups(courses);
  const generator = usePlanGenerator(pool.cards, courses, classGroups.planGroupCourses);
  const { planState, updatePlanState } = usePlans();
  // 时间段偏好编辑模式（会话态，与原站 planPrefEditMode 一致不持久化）
  const [prefEditing, setPrefEditing] = useState(false);
  // 「复制到方案排课」结果提示（模拟原站 toast）
  const [copyHint, setCopyHint] = useState("");

  const isPlanMode = settings.scheduleMode === "plan";

  // 网格显示源（与原站 getActiveCoursesForDisplay 一致）：
  // - plan 模式：激活方案课程 + 激活班级课程组（均未生成且无组时走过渡预览）；
  // - class 模式：激活班级组减去排除项。
  const planDisplayCourses = [...(generator.activePlanCourses ?? []), ...classGroups.planGroupCourses];
  const gridOverride = isPlanMode
    ? generator.hasGenerated || planDisplayCourses.length
      ? planDisplayCourses
      : null
    : classGroups.classModeDisplayCourses;
  const timetable = useTimetable(pool.cards, courses, gridOverride);

  useEffect(() => {
    document.title = "秋功-排课表工具";
  }, []);

  // 复制提示自动消散
  useEffect(() => {
    if (!copyHint) return;
    const timer = window.setTimeout(() => setCopyHint(""), 3000);
    return () => window.clearTimeout(timer);
  }, [copyHint]);

  const toggleMode = () => {
    setPrefEditing(false);
    updateSettings({ scheduleMode: isPlanMode ? "class" : "plan" });
  };

  const cycleCampus = () => {
    const index = CAMPUS_CYCLE.indexOf(settings.campusPreference);
    const next = CAMPUS_CYCLE[(index + 1) % CAMPUS_CYCLE.length];
    updateSettings({ campusPreference: next });
  };

  const pickCourse = (candidate: CourseCandidate) => {
    pool.addCourse({ code: candidate.code, name: candidate.name });
  };

  const pickClass = (candidate: { className: string }) => {
    classGroups.ingestClassGroup(candidate.className);
  };

  // 「复制到方案排课」：激活的 class 组复制到 plan 组并切换到 plan 模式（与原站一致）
  const handleCopyToPlan = () => {
    const result = classGroups.copyClassGroupsToPlan();
    if (!result.groups) {
      setCopyHint("班级课表中没有已启用的课程可复制");
      return;
    }
    setCopyHint(`已复制 ${result.groups} 个班级课表组（${result.courses} 门课程）到方案池`);
    setPrefEditing(false);
    updateSettings({ scheduleMode: "plan" });
  };

  // ── 阻塞时段偏好（原站 handleGridPreferenceInteraction / resetPlanPreferences）──
  const toggleBlockedCell = (day: number, bigPeriod: number) => {
    const key = `${day}-${bigPeriod}`;
    updatePlanState((prev) => ({
      ...prev,
      blockedCells: prev.blockedCells.includes(key)
        ? prev.blockedCells.filter((item) => item !== key)
        : [...prev.blockedCells, key],
    }));
  };
  const toggleBlockedDay = (day: number) => {
    updatePlanState((prev) => ({
      ...prev,
      blockedDays: prev.blockedDays.includes(day)
        ? prev.blockedDays.filter((item) => item !== day)
        : [...prev.blockedDays, day],
    }));
  };
  const toggleBlockedPeriod = (bigPeriod: number) => {
    updatePlanState((prev) => ({
      ...prev,
      blockedPeriods: prev.blockedPeriods.includes(bigPeriod)
        ? prev.blockedPeriods.filter((item) => item !== bigPeriod)
        : [...prev.blockedPeriods, bigPeriod],
    }));
  };
  const resetPreferences = () => {
    setPrefEditing(false);
    updateSettings({ campusPreference: "none" });
    updatePlanState((prev) => ({
      ...prev,
      blockedCells: [],
      blockedDays: [],
      blockedPeriods: [],
    }));
  };

  return (
    <>
      <FloatingChrome links={SIDEBAR_LINKS} />

      <div className="ca-beta-page">
        {/* 顶栏：搜索区 + 模式切换 */}
        <div className="beta-topbar ca-gradient-surface">
          <div className="beta-version-label">排课表工具 v{APP_VERSION_CA}</div>
          <div className="search-row">
            <div className="search-boxes">
              {isPlanMode ? (
                <SearchBar
                  placeholder="课程检索：课程编号或课程名称"
                  clearAriaLabel="清空课程检索"
                  dataReady={!loading && !error}
                  loadingText="课程数据加载中，请稍候..."
                  emptyText="未找到匹配课程"
                  onQuery={(query) => findCourseCandidates(courses, query)}
                  getLabel={(candidate) => candidate.label}
                  onPick={pickCourse}
                />
              ) : (
                <SearchBar
                  placeholder="班级课表：输入班级名称后调用整班课表"
                  clearAriaLabel="清空班级检索"
                  dataReady={!loading && !error}
                  loadingText="课程数据加载中，请稍候..."
                  emptyText="未找到匹配班级"
                  onQuery={(query) => findClassTimetableCandidates(courses, query)}
                  getLabel={(candidate) => candidate.label}
                  onPick={pickClass}
                />
              )}
            </div>
            <div className="button-area">
              <button type="button" className="action-btn" onClick={toggleMode}>
                {isPlanMode ? "切换到班级课表调用" : "切换到自助方案排课"}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="error-banner">课程数据加载失败：{error}</div>}

        {/* 「复制到方案排课」结果提示（全局位置，模式切换后不丢失，模拟原站 toast） */}
        {copyHint && <div className="copy-hint-banner">{copyHint}</div>}

        <main className="beta-main">
          {/* 左栏：课表网格（双模式；偏好编辑仅 plan 模式可用，与原站一致） */}
          <div className="beta-schedule">
            <TimetableGrid
              timetable={timetable}
              pref={
                isPlanMode
                  ? {
                      editing: prefEditing,
                      blockedCells: planState.blockedCells,
                      blockedDays: planState.blockedDays,
                      blockedPeriods: planState.blockedPeriods,
                      onToggleCell: toggleBlockedCell,
                      onToggleDay: toggleBlockedDay,
                      onTogglePeriod: toggleBlockedPeriod,
                    }
                  : undefined
              }
              summary={
                isPlanMode
                  ? undefined
                  : `${timetable.placedCardCount} 门课程已显示 · ${timetable.conflictCount} 门冲突`
              }
              emptyHint={isPlanMode ? undefined : "从顶部搜索框选择班级并「选中整班」后，课程将显示在网格中。"}
            />
          </div>

          {/* 右栏：候选卡片池 + 偏好/方案按钮区（对应原站 #Sidebar） */}
          <aside className="beta-sidebar">
            {/* 候选课程卡片池（plan 模式，PlanProvider 持久化） */}
            {isPlanMode ? (
              <>
                <CourseCardPool pool={pool} />
                {/* plan 模式：来自班级课表的课程组（方案生成固定占用） */}
                <ClassGroupSection
                  title="来自班级课表的课程组"
                  subtitle="选中整班后作为固定占用参与方案生成"
                  groups={classGroups.planGroups}
                  conflicts={classGroups.planGroupConflicts}
                  onToggleActive={classGroups.togglePlanGroup}
                  onToggleCourse={classGroups.togglePlanGroupCourse}
                  onRemove={classGroups.removePlanGroup}
                  emptyHint=""
                />
              </>
            ) : (
              /* class 模式：班级课表组池 */
              <ClassGroupSection
                title="班级课表卡片池"
                subtitle={`${classGroups.classModeGroups.length} 个班级组 · PlanProvider 持久化`}
                groups={classGroups.classModeGroups}
                conflicts={classGroups.classModeConflicts}
                onToggleActive={classGroups.toggleClassModeGroup}
                onToggleCourse={classGroups.toggleClassModeCourse}
                onRemove={classGroups.removeClassModeGroup}
                emptyHint="从顶部搜索框选择班级后，将在此生成班级课表卡片。"
                toolbar={
                  <>
                    <div className="plan-toolbar">
                      <button type="button" className="pool-btn" onClick={classGroups.clearClassModeGroups}>
                        一键清除
                      </button>
                      <button type="button" className="pool-btn" onClick={classGroups.selectAllClassModeGroups}>
                        全选
                      </button>
                      <button type="button" className="pool-btn plan-generate-btn" onClick={handleCopyToPlan}>
                        复制到方案排课
                      </button>
                    </div>
                  </>
                }
              />
            )}

            {/* 用户设置接口演示 */}
            <section className="surface-card beta-card">
              <h2 className="beta-card-title">
                用户设置
                <span className="beta-card-sub">SettingsProvider 接口 · 后端就绪</span>
              </h2>
              <div className="settings-row">
                <span className="settings-label">校区偏好</span>
                <button type="button" className="action-btn settings-cycle-btn" onClick={cycleCampus}>
                  {CAMPUS_LABEL[settings.campusPreference]}
                </button>
                <span className="muted">点击在「无 → 东校区 → 西校区」间循环</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">默认排课模式</span>
                <span>{isPlanMode ? "自助方案排课" : "班级课表调用"}</span>
                <span className="muted">由顶栏切换按钮修改</span>
              </div>
              <p className="muted settings-note">
                {ready
                  ? "设置已持久化（当前为 localStorage 实现），刷新页面后保留；接入后端后仅需替换 SettingsProvider 实现即可同步到云端。"
                  : "设置加载中…"}
              </p>
            </section>

            {/* 方案生成面板（plan 模式） */}
            {isPlanMode && (
              <PlanGeneratorPanel
                generator={generator}
                prefEditing={prefEditing}
                onTogglePrefEditing={() => setPrefEditing((v) => !v)}
                onResetPreferences={resetPreferences}
                campusPreference={settings.campusPreference}
                onCycleCampus={cycleCampus}
              />
            )}
          </aside>
        </main>
      </div>
    </>
  );
}
