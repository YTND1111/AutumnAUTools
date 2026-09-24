import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import SearchBar from "../components/SearchBar";
import CourseCardPool from "../components/CourseCardPool";
import TimetableGrid from "../components/TimetableGrid";
import PlanGeneratorPanel from "../components/PlanGeneratorPanel";
import ClassGroupSection from "../components/ClassGroupSection";
import ExternalLink from "../components/ExternalLink";
import SpotlightGuide from "../components/SpotlightGuide";
import type { GuideStep } from "../components/SpotlightGuide";
import { useCourseData } from "../hooks/useCourseData";
import { usePlanPool } from "../hooks/usePlanPool";
import type { PlanPool } from "../hooks/usePlanPool";
import { useTimetable } from "../hooks/useTimetable";
import { usePlanGenerator } from "../hooks/usePlanGenerator";
import { useClassGroups } from "../hooks/useClassGroups";
import type { ClassGroups } from "../hooks/useClassGroups";
import { usePlans } from "../plans/PlansContext";
import { useSettings } from "../settings/SettingsContext";
import { getCardKey } from "../plans/types";
import { APP_VERSION_CA, CAU_COURSE_ASSISTANT_URL } from "../config";
import type { CourseCandidate, CourseRecord } from "../services/courseData";
import { findClassTimetableCandidates, findCourseCandidates, NON_CLASS_NAME, splitClasses } from "../services/courseData";
import type { PlanCourse } from "../services/planGenerator";
import { downloadTimetableTxt } from "../services/timetableExport";
import "./CaBetaPage.css";

/**
 * CaBetaPage —— 排课表工具（原生 React 版，正式路由 /ca）。
 *
 * 页面为「自助方案排课」单视图（班级课表调用模式已移除，不再有模式切换）：
 * - 顶栏：课程检索（课程编号/名称），添加候选课程卡片；检索框下方为站外链接入口
 *   （CAU 选课助手，第三方站点；点击时由全局 ExternalLinkGuard 弹出风险提醒）；
 * - 课表网格：6 大节 × 7 天，周次定位持久化；头部右侧提供「导出当前课表」(.txt)；
 *   显示源 = 激活方案课程 + 班级课表调用组的固定占用（未生成方案且无组时走过渡
 *   预览：每张卡片一个教学班、点击块循环切换，会话态）；冲突检测/高亮与原站一致；
 * - 右栏：
 *   1. 候选课程卡片池：卡片增删、参与排课开关、教师/校区筛选维度；
 *   2. 「班级课表调用」子功能区：班级检索 → 整班课表作为固定占用
 *      （默认即参与排课避让，可单门排除/整组取消/全选/清除）；
 *   3. 方案生成面板：偏好设置（校区/时间段/重置）+ 全宽「生成方案」主按钮
 *      + 方案候选 pills（无冲突/冲突）；时间段偏好编辑模式点击课表设置阻塞；
 *   4. 用户设置（精简）：本地自动保存说明 + 重新打开「新手引导」。
 * - 新手引导（SpotlightGuide）：首次访问自动弹出，可随时重开；各步骤可
 *   一键「自动演示」（添加示例课程/班级、示范偏好、实际导出 txt），
 *   结束时清理全部演示数据。
 *
 * 状态持久化：候选卡池/班级组/阻塞时段/周次经 PlanProvider（localStorage，
 * 后端就绪后按 ownerId 隔离），校区偏好经 SettingsProvider。
 *
 * 路由说明：/ca-beta 重定向至此；原遗留挂载退至 /ca-legacy（无入口，回滚兜底）。
 */

/** 新手引导“已看过”标记（localStorage） */
const GUIDE_SEEN_KEY = "autumn-ca-guide-seen";

/** 演示课程选择：优先选有多个教学班（课序号/上课时间多样）的课程，便于演示卡片定制 */
function pickDemoCourse(courses: CourseRecord[]): { code: string; name: string } | null {
  const grouped = new Map<string, { code: string; name: string; count: number }>();
  courses.forEach((record) => {
    const code = String(record["课程编号"] ?? "").trim();
    const name = String(record["课程名称"] ?? "").trim();
    if (!code || !name) return;
    const key = `${code}|${name}`;
    const item = grouped.get(key) ?? { code, name, count: 0 };
    item.count += 1;
    grouped.set(key, item);
  });
  const prefer = Array.from(grouped.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count);
  return prefer[0] ?? Array.from(grouped.values())[0] ?? null;
}

/** 引导演示固定调用的示例班级（真实班级，非“临班”） */
const DEMO_CLASS_NAME = "试验261";

/** 演示班级：固定「试验261」；若数据缺失或已被调用，则退回未调用过的、课程最多的真实班级 */
function pickDemoClass(courses: CourseRecord[], exclude: Set<string>): string | null {
  const hasClass = (name: string) =>
    courses.some((record) => splitClasses(record["上课班级"]).includes(name));
  if (hasClass(DEMO_CLASS_NAME) && !exclude.has(DEMO_CLASS_NAME)) {
    return DEMO_CLASS_NAME;
  }
  const countBy = new Map<string, number>();
  courses.forEach((record) => {
    splitClasses(record["上课班级"]).forEach((name) => {
      if (name === NON_CLASS_NAME) return;
      countBy.set(name, (countBy.get(name) ?? 0) + 1);
    });
  });
  const candidates = Array.from(countBy.entries())
    .filter(([name]) => name.trim() && !exclude.has(name))
    .sort((a, b) => b[1] - a[1]);
  return candidates.length ? candidates[0][0] : null;
}

export default function CaBetaPage() {
  const { courses, loading, error } = useCourseData();
  const { settings, updateSettings } = useSettings();
  const pool = usePlanPool(courses);
  const classGroups = useClassGroups(courses);
  const generator = usePlanGenerator(pool.cards, courses, classGroups.fixedCourses);
  const { planState, updatePlanState } = usePlans();
  // 时间段偏好编辑模式（会话态，与原站 planPrefEditMode 一致不持久化）
  const [prefEditing, setPrefEditing] = useState(false);
  // 「导出当前课表」结果提示（临时）
  const [exportMsg, setExportMsg] = useState("");
  // 新手引导开关
  const [guideOpen, setGuideOpen] = useState(false);

  // ── 引导/导出演示用的“当前值”引用（避免闭包读到过期状态）──
  const coursesRef = useRef(courses);
  coursesRef.current = courses;
  const poolRef = useRef<PlanPool>(pool);
  poolRef.current = pool;
  const classGroupsRef = useRef<ClassGroups>(classGroups);
  classGroupsRef.current = classGroups;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const planStateRef = useRef(planState);
  planStateRef.current = planState;
  const autoOpenedRef = useRef(false);

  // 网格显示源：激活方案课程 + 班级课表调用组的固定占用
  // （两者皆空且未生成时走过渡预览）
  const gridDisplayCourses = [...(generator.activePlanCourses ?? []), ...classGroups.fixedCourses];
  const gridOverride =
    generator.hasGenerated || gridDisplayCourses.length ? gridDisplayCourses : null;
  const timetable = useTimetable(pool.cards, courses, gridOverride);
  const gridDisplayRef = useRef<PlanCourse[]>(gridDisplayCourses);
  gridDisplayRef.current = gridDisplayCourses;

  useEffect(() => {
    document.title = "秋功-排课表工具";
  }, []);

  // 首次访问（且未看过引导、数据就绪后）自动弹出新手引导
  useEffect(() => {
    if (loading || error || !courses.length || autoOpenedRef.current) return;
    let seen = false;
    try {
      seen = localStorage.getItem(GUIDE_SEEN_KEY) === "1";
    } catch {
      /* 忽略 localStorage 不可用 */
    }
    if (seen) return;
    autoOpenedRef.current = true;
    const timer = window.setTimeout(() => setGuideOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [loading, error, courses.length]);

  // ── 校区偏好直接设定（方案生成面板内分段按钮调用；经 SettingsProvider 持久化）──
  const setCampus = (value: "none" | "east" | "west") => {
    updateSettings({ campusPreference: value });
  };

  const pickCourse = (candidate: CourseCandidate) => {
    pool.addCourse({ code: candidate.code, name: candidate.name });
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

  // ── 课表导出（当前网格显示课程 → 下载 txt；与原站 exportTimetable 一致）──
  const performExport = (): string => {
    const summary = downloadTimetableTxt(coursesRef.current, gridDisplayRef.current);
    if (!summary) {
      const message = "当前课表没有课程，无需导出";
      setExportMsg(message);
      return message;
    }
    const message = `已导出 ${summary.count} 门课程，总学分 ${summary.credit.toFixed(1)}（${summary.fileName}）`;
    setExportMsg(message);
    return message;
  };

  // ── 新手引导：演示动作与演示数据撤销记录 ──
  const undoStackRef = useRef<Array<() => void>>([]);
  const pushUndo = (undo: () => void) => {
    undoStackRef.current.push(undo);
  };
  const clearDemoData = () => {
    setPrefEditing(false);
    let undo: (() => void) | undefined;
    while ((undo = undoStackRef.current.pop())) {
      try {
        undo();
      } catch (err) {
        console.warn("[引导] 清理演示数据失败", err);
      }
    }
  };

  /** 步骤演示动作（返回结果提示文案） */
  const demoAddCourse = (): string => {
    const demo = pickDemoCourse(coursesRef.current);
    if (!demo) return "暂无可演示的课程数据";
    if (poolRef.current.hasCard(demo.code, demo.name)) {
      return `「${demo.name}」已在候选池中，无需重复添加`;
    }
    poolRef.current.addCourse({ code: demo.code, name: demo.name });
    pushUndo(() => poolRef.current.removeCard(getCardKey(demo.code, demo.name)));
    return `已添加示例课程「${demo.name}（${demo.code}）」到候选卡片池`;
  };

  const demoAddClass = (): string => {
    const exclude = new Set(classGroupsRef.current.groups.map((group) => group.className));
    const className = pickDemoClass(coursesRef.current, exclude);
    if (!className) return "暂无可演示的班级数据";
    classGroupsRef.current.addClass(className);
    pushUndo(() => classGroupsRef.current.removeGroup(`class-group|${className}`));
    return `已调用班级「${className}」：整班课程已作为固定占用加入课表`;
  };

  const demoPreferences = (): string => {
    // 校区偏好示范（切换后引导结束会恢复原值）
    const originalCampus = settingsRef.current.campusPreference;
    const demoCampus = originalCampus === "west" ? "east" : "west";
    setCampus(demoCampus);
    pushUndo(() => setCampus(originalCampus));

    // 找一个空闲格子设为阻塞示范
    const state = planStateRef.current;
    let target: { day: number; bigPeriod: number } | null = null;
    for (let bigPeriod = 3; bigPeriod <= 5 && !target; bigPeriod += 1) {
      for (let day = 1; day <= 7; day += 1) {
        if (
          !state.blockedDays.includes(day) &&
          !state.blockedPeriods.includes(bigPeriod) &&
          !state.blockedCells.includes(`${day}-${bigPeriod}`)
        ) {
          target = { day, bigPeriod };
          break;
        }
      }
    }
    if (target) {
      const key = `${target.day}-${target.bigPeriod}`;
      toggleBlockedCell(target.day, target.bigPeriod);
      pushUndo(() =>
        updatePlanState((prev) => ({
          ...prev,
          blockedCells: prev.blockedCells.filter((item) => item !== key),
        }))
      );
    }
    return `已示范：校区偏好设为「${demoCampus === "east" ? "东校区" : "西校区"}」${
      target ? "，并在课表中设了一个阻塞时段（红色）" : ""
    }。下一步在课表网格中查看效果`;
  };

  // 引导步骤切换时的页面状态联动（如进入/退出阻塞时段编辑）
  const handleGuideStepChange = (_index: number, step: GuideStep) => {
    if (step.key === "pref-panel" || step.key === "pref-grid") {
      setPrefEditing(true);
    } else {
      setPrefEditing(false);
    }
  };

  const finishGuide = (completed: boolean) => {
    clearDemoData();
    setGuideOpen(false);
    try {
      localStorage.setItem(GUIDE_SEEN_KEY, "1");
    } catch {
      /* 忽略 localStorage 不可用 */
    }
    void completed;
  };

  const guideSteps: GuideStep[] = [
    {
      key: "intro",
      title: "欢迎使用排课表工具",
      body:
        "这里是「自助方案排课」：左侧课表网格展示排课结果，右侧从上到下依次是候选课程卡片池、" +
        "班级课表调用、方案生成面板。排课进度与设置会自动保存在本地浏览器。接下来按 5 步带你上手，" +
        "你也可以随时点「跳过引导」。",
    },
    {
      key: "course-search",
      anchor: "#guide-course-search",
      title: "① 课程检索与课程卡片定制",
      body:
        "在顶部检索框输入课程编号或课程名称（例如「园艺产品鉴赏」或「01131565」），" +
        "从建议列表点选即可把课程加入右侧候选卡片池。点下面的按钮自动演示一次。",
      demoLabel: "自动添加一门示例课程",
      onDemo: demoAddCourse,
    },
    {
      key: "course-pool",
      anchor: "#guide-course-pool",
      title: "① 候选卡片定制",
      body:
        "每张课程卡片默认参与排课。点卡片上的「筛选 ▾」可展开：勾选/取消教学班的" +
        "教师、校区、班级筛选维度（置灰 = 被过滤），并查看每个教学班的课序号与限选人数。" +
        "想排除某门课，取消勾选「参与排课」或直接点 × 移除。",
    },
    {
      key: "class-call",
      anchor: "#guide-class-call",
      title: "② 班级课表调用与定制",
      body:
        "「班级课表调用」用于把某个班级的整班课表并入你的排课：其全部课程会自动作为" +
        "固定占用显示在课表，并在生成方案时自动避让（相当于原“复制到方案排课”）。" +
        "点下面的按钮演示调用一个班级。",
      demoLabel: "自动调用一个示例班级",
      onDemo: demoAddClass,
    },
    {
      key: "class-group",
      anchor: "#guide-class-call",
      title: "② 班级课表定制",
      body:
        "调用后生成的班级课表组里，点任意一门课程可“排除/恢复”它（该门课不再占用与避让）；" +
        "「取消整班」让整班退出课表；工具栏的「全选 / 一键清除」管理所有班级组。" +
        "班级组之间有冲突时卡片会红色提示。",
    },
    {
      key: "pref-panel",
      anchor: "#guide-prefs",
      title: "③ 偏好设置",
      body:
        "方案生成面板内的「偏好设置」集中管理：校区偏好（无/东/西三选一）、时间段偏好" +
        "（点「设置阻塞时段」后在课表里把不想上课的时间标红）、重置偏好。点按钮自动示范一次。",
      demoLabel: "示范校区偏好与阻塞时段",
      onDemo: demoPreferences,
    },
    {
      key: "pref-grid",
      anchor: "#guide-grid",
      title: "③ 在课表上调整时间段偏好",
      body:
        "现在处于「阻塞时段」编辑模式（课表四周绿色高亮）。红色格子 = 该时段不可用，方案生成" +
        "会自动避开；点击红色格子可取消，点击普通格子/星期/节次表头可新增阻塞。" +
        "调整完点方案生成面板里的「完成设置」即可保存。",
    },
    {
      key: "export",
      anchor: "#guide-export-btn",
      title: "④ 导出课表",
      body:
        "课表头部右侧的「导出当前课表」可以把当前网格显示的课程一键导出为 txt 清单" +
        "（含课程编号、教师、时间地点、周次、学分与总学分）。点下面按钮实际导出一份试试。",
      demoLabel: "导出一份示例课表 (.txt)",
      onDemo: () => performExport(),
    },
    {
      key: "done",
      title: "引导完成",
      body:
        "到此你就掌握了排课表工具的完整流程：检索课程 → 定制候选 → 调用班级课表 → " +
        "设置偏好 → 生成方案 → 导出课表。本次演示添加的示例课程 / 班级 / 偏好将在关闭引导时自动清理，" +
        "不会影响你的真实排课数据。",
      nextLabel: "完成引导",
    },
  ];

  // 导出按钮区（课表头部右侧；含结果提示）
  const exportActions: ReactNode = (
    <>
      {exportMsg && <span className="tt-export-msg">{exportMsg}</span>}
      <button id="guide-export-btn" type="button" className="pool-btn tt-export-btn" onClick={performExport}>
        导出当前课表 (.txt)
      </button>
    </>
  );

  return (
    <>

      <div className="ca-beta-page">
        {/* 顶栏：课程检索（班级检索位于侧栏「班级课表调用」子功能区） */}
        <div className="beta-topbar ca-gradient-surface">
          <div className="beta-version-label">排课表工具 v{APP_VERSION_CA}</div>
          <div className="search-row">
            <div id="guide-course-search" className="search-boxes">
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
            </div>
          </div>

          {/* 站外链接入口：CAU 选课助手（第三方站点，点击时由全局 ExternalLinkGuard 弹出风险提醒） */}
          <div className="beta-ext-row">
            <span className="beta-ext-note" role="note">
              外链提醒：右侧按钮指向外部网站，内容由@kaiyangfu提供
            </span>
            <ExternalLink href={CAU_COURSE_ASSISTANT_URL} className="beta-ext-btn">
              CAU选课助手
            </ExternalLink>
          </div>
        </div>

        {error && <div className="error-banner">课程数据加载失败：{error}</div>}

        <main className="beta-main">
          {/* 左栏：课表网格（id 供新手引导定位） */}
          <div id="guide-grid" className="beta-schedule">
            <TimetableGrid
              timetable={timetable}
              actions={exportActions}
              pref={{
                editing: prefEditing,
                blockedCells: planState.blockedCells,
                blockedDays: planState.blockedDays,
                blockedPeriods: planState.blockedPeriods,
                onToggleCell: toggleBlockedCell,
                onToggleDay: toggleBlockedDay,
                onTogglePeriod: toggleBlockedPeriod,
              }}
            />
          </div>

          {/* 右栏：候选卡片池 + 班级课表调用 + 方案生成 + 设置说明 */}
          <aside className="beta-sidebar">
            {/* 候选课程卡片池 */}
            <div id="guide-course-pool">
              <CourseCardPool pool={pool} />
            </div>

            {/* 班级课表调用子功能区：整班调用默认参与排课（原「复制到方案排课」行为） */}
            <div id="guide-class-call">
              <ClassGroupSection
                title="班级课表调用"
                subtitle="整班课表将作为固定占用显示并参与排课避让，可单门排除"
                groups={classGroups.groups}
                conflicts={classGroups.conflicts}
                onToggleActive={classGroups.toggleActive}
                onToggleCourse={classGroups.toggleCourse}
                onRemove={classGroups.removeGroup}
                emptyHint="在上方输入班级名称（如「生技242」）后，将整班调用其课表。"
                toolbar={
                  <>
                    <div className="class-call-search">
                      <SearchBar
                        placeholder="班级课表调用：输入班级名称整班排课"
                        clearAriaLabel="清空班级检索"
                        dataReady={!loading && !error}
                        loadingText="课程数据加载中，请稍候..."
                        emptyText="未找到匹配班级"
                        onQuery={(query) => findClassTimetableCandidates(courses, query)}
                        getLabel={(candidate) => candidate.label}
                        onPick={(candidate) => classGroups.addClass(candidate.className)}
                      />
                    </div>
                    <div className="plan-toolbar">
                      <button type="button" className="pool-btn" onClick={classGroups.selectAll}>
                        全选
                      </button>
                      <button type="button" className="pool-btn" onClick={classGroups.clearAll}>
                        一键清除
                      </button>
                    </div>
                  </>
                }
              />
            </div>

            {/* 方案生成面板（偏好设置 + 生成主操作 + 方案候选） */}
            <div id="guide-prefs">
              <PlanGeneratorPanel
                generator={generator}
                prefEditing={prefEditing}
                onTogglePrefEditing={() => setPrefEditing((v) => !v)}
                onResetPreferences={resetPreferences}
                campusPreference={settings.campusPreference}
                onSetCampus={setCampus}
              />
            </div>

            {/* 用户设置（精简：本地自动保存说明 + 重新打开引导） */}
            <section className="surface-card beta-card">
              <h2 className="beta-card-title">
                用户设置
                <span className="beta-card-sub">本地自动保存</span>
              </h2>
              <p className="muted settings-note">
                候选课程、班级课表调用、阻塞时段与偏好设置均自动保存在本浏览器中，刷新后自动恢复。
              </p>
              <div className="guide-reopen">
                <button type="button" className="pool-btn" onClick={() => setGuideOpen(true)}>
                  查看新手引导
                </button>
              </div>
              <p className="guide-ai-note">引导内容由 AI 生成</p>
            </section>
          </aside>
        </main>
      </div>

      {/* 交互式新手引导 */}
      <SpotlightGuide
        steps={guideSteps}
        open={guideOpen}
        onExit={finishGuide}
        onStepChange={handleGuideStepChange}
      />
    </>
  );
}
