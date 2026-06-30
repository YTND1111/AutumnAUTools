const COURSE_DATA_PATH = "./src/py/中国农业大学2026-2027学年秋季学期通知单课表.json";
const WEEK_HEADERS = ["节次", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAY_TO_COLUMN = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7 };
const COLUMN_TO_DAY = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
const BIG_PERIOD_LABELS = ["第一大节", "第二大节", "第三大节", "第四大节", "第五大节", "第六大节"];
const PERIOD_TO_BIG_PERIOD = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4, 11: 5, 12: 5 };

const scheduleModeToggleButton = document.getElementById("ScheduleModeToggleButton");
const classModeToggleButton = document.getElementById("ClassModeToggleButton");
const modeTag = document.getElementById("ModeTag");
const planCandidateArea = document.getElementById("PlanCandidateArea");

const courseSearchBar = document.getElementById("CourseSearchBar");
const classSearchBar = document.getElementById("ClassSearchBar");

const courseSearchInput = document.getElementById("CourseSearchInput");
const classSearchInput = document.getElementById("ClassSearchInput");
const courseSearchClear = document.getElementById("CourseSearchClear");
const classSearchClear = document.getElementById("ClassSearchClear");

const courseSuggestionBox = document.getElementById("CourseSuggestionBox");
const classSuggestionBox = document.getElementById("ClassSuggestionBox");

const weekFilter = document.getElementById("WeekFilter");
const weekSummary = document.getElementById("WeekSummary");
const poolToolbar = document.getElementById("PoolToolbar");
const scheduleGrid = document.getElementById("ScheduleGrid");
const candidatePool = document.getElementById("CandidatePool");
const softToast = document.getElementById("SoftToast");
const clearPoolTopButton = document.getElementById("ClearPoolTopButton");
const generatePlanTopButton = document.getElementById("GeneratePlanTopButton");
const copyClassToPlanButton = document.getElementById("CopyClassToPlanButton");
const exportTimetableButton = document.getElementById("ExportTimetableButton");

let courseList = [];
let scheduleMode = "plan";
let selectedWeek = "all";
let maxWeek = 20;
let planPrefEditMode = false;
let toastTimer = 0;

const classGroupPool = new Map();
const activeClassGroupKeys = new Set();
const classGroupExcludedCourseKeys = new Map();
const poolRenderQueue = [];

const planCourseCards = new Map();
const activePlanCourseCardKeys = new Set();
const generatedPlans = [];
const conflictingPlans = [];
let activePlanId = "";

const planClassGroups = new Map();
const activePlanClassGroupKeys = new Set();
const planClassGroupExcludedCourseKeys = new Map();

const planPreferences = {
    campus: new Set(["无"]),
    blockedCells: new Set(),
    blockedDays: new Set(),
    blockedPeriods: new Set()
};

window.selectedCourseRecord = null;
window.selectedCourseKeyValuePairs = [];

function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
}

function showToast(message) {
    if (!softToast) {
        return;
    }

    softToast.textContent = message;
    softToast.classList.add("is-show");
    if (toastTimer) {
        window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
        softToast.classList.remove("is-show");
    }, 2100);
}

function formatNowForFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

function parseCredit(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function exportTimetable() {
    const activeCourses = getActiveCoursesForDisplay();
    if (!activeCourses.length) {
        showToast("当前课表没有课程，无需导出");
        return;
    }

    const seen = new Set();
    const uniqueCourses = [];
    let totalCredit = 0;

    activeCourses.forEach((course) => {
        const uniqueKey = [
            String(course.record["通知单号"] ?? ""),
            String(course.record["课程编号"] ?? ""),
            String(course.record["课序号"] ?? ""),
            String(course.record["上课时间"] ?? "")
        ].join("|");

        if (seen.has(uniqueKey)) {
            return;
        }
        seen.add(uniqueKey);
        uniqueCourses.push(course);

        totalCredit += parseCredit(course.record["学分"]);
    });

    const lines = [];
    lines.push("课表课程清单");
    lines.push(`导出时间：${formatNowForFilename().replace("_", " ")}`);
    lines.push(`课程总数：${uniqueCourses.length} 门`);
    lines.push("");

    uniqueCourses.forEach((course, index) => {
        const record = course.record;
        lines.push(`【${index + 1}】${course.title || "未命名课程"}`);
        lines.push(`    课程编号：${course.courseCode || "-"}`);
        lines.push(`    课序号：${record["课序号"] || "-"}`);
        lines.push(`    通知单号：${record["通知单号"] || "-"}`);
        lines.push(`    授课教师：${course.teacher || "-"}`);
        lines.push(`    上课班级：${course.classText || "-"}`);
        lines.push(`    上课时间：${course.timeText || "-"}`);
        lines.push(`    上课地点：${course.locationText || "-"}`);
        lines.push(`    上课周次：${course.weekText || "-"}`);
        lines.push(`    校区：${course.campus || "-"}`);
        lines.push(`    课程性质：${record["课程性质"] || "-"}`);
        lines.push(`    学分：${record["学分"] ?? "-"}`);
        lines.push("");
    });

    lines.push(`总学分：${totalCredit.toFixed(1)}`);

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `课表清单_${formatNowForFilename()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`已导出 ${uniqueCourses.length} 门课程，总学分 ${totalCredit.toFixed(1)}`);
}

function stringifyCourse(course) {
    return Object.entries(course)
        .map(([key, value]) => `${key}:${value ?? ""}`)
        .join("|")
        .toLowerCase();
}

function hasNumber(text) {
    return /\d/.test(text);
}

function splitTeachers(raw) {
    return String(raw ?? "")
        .split(/[，,、]/)
        .map((name) => name.trim())
        .filter(Boolean);
}

function splitClasses(raw) {
    return String(raw ?? "")
        .split(/[，,、\s/]+/)
        .map((name) => name.trim())
        .filter(Boolean);
}

function parseRangeToken(token) {
    const clean = String(token ?? "").trim();
    if (!clean) {
        return [];
    }

    if (clean.includes("-")) {
        const [start, end] = clean.split("-").map((value) => Number(value));
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            return [];
        }
        const low = Math.min(start, end);
        const high = Math.max(start, end);
        const result = [];
        for (let value = low; value <= high; value += 1) {
            result.push(value);
        }
        return result;
    }

    const single = Number(clean);
    if (!Number.isFinite(single)) {
        return [];
    }
    return [single];
}

function buildWeekRangesFromText(weekText) {
    const content = String(weekText ?? "").trim();
    if (!content) {
        return [{ start: 1, end: maxWeek }];
    }

    const ranges = [];
    content.split(",").forEach((token) => {
        const values = parseRangeToken(token);
        if (!values.length) {
            return;
        }
        ranges.push({ start: values[0], end: values[values.length - 1] });
    });

    if (!ranges.length) {
        return [{ start: 1, end: maxWeek }];
    }

    return ranges;
}

function buildPeriodRangesFromText(periodText) {
    const ranges = [];
    String(periodText ?? "")
        .split(",")
        .forEach((token) => {
            const values = parseRangeToken(token);
            if (!values.length) {
                return;
            }
            ranges.push({ start: values[0], end: values[values.length - 1] });
        });
    return ranges;
}

function mergeRanges(ranges) {
    if (!ranges.length) {
        return [];
    }

    const sorted = ranges
        .map((range) => ({ start: range.start, end: range.end }))
        .sort((a, b) => a.start - b.start);

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        const tail = merged[merged.length - 1];
        if (current.start <= tail.end + 1) {
            tail.end = Math.max(tail.end, current.end);
        } else {
            merged.push(current);
        }
    }
    return merged;
}

function parseCourseSchedule(course) {
    const source = String(course["上课时间"] ?? "").trim();
    if (!source) {
        return [];
    }

    const segments = source
        .split(/[;；]/)
        .map((item) => item.trim())
        .filter(Boolean);

    const entries = [];
    segments.forEach((segment) => {
        const match = segment.match(/周([一二三四五六日天])第([\d,\-]+)节(?:\{第([^}]*)周\})?/);
        if (!match) {
            return;
        }

        const dayColumn = DAY_TO_COLUMN[match[1]];
        if (!dayColumn) {
            return;
        }

        const periodRanges = buildPeriodRangesFromText(match[2]).map((range) => ({
            start: Math.max(1, range.start),
            end: Math.min(12, range.end)
        }));

        const weekRawText = String(match[3] || course["上课周次"] || "").trim();
        const weekRanges = buildWeekRangesFromText(weekRawText);

        const periods = periodRanges.flatMap((range) => {
            const values = [];
            for (let p = range.start; p <= range.end; p += 1) {
                values.push(p);
            }
            return values;
        });

        entries.push({
            dayColumn,
            periodRanges,
            weekRanges,
            periods,
            rawText: segment,
            weekText: weekRawText
        });
    });

    return entries;
}

function getCourseKey(record) {
    return [
        String(record["通知单号"] ?? ""),
        String(record["课程编号"] ?? ""),
        String(record["课序号"] ?? ""),
        String(record["课程名称"] ?? ""),
        String(record["上课时间"] ?? "")
    ].join("|");
}

function buildPoolCourse(course) {
    const record = { ...course };
    const poolKey = getCourseKey(record);
    const entries = parseCourseSchedule(record);
    return {
        type: "course",
        poolKey,
        record,
        entries,
        title: String(record["课程名称"] ?? "未命名课程").trim(),
        courseCode: String(record["课程编号"] ?? "").trim(),
        teacher: String(record["教师姓名"] ?? "").trim(),
        classText: String(record["上课班级"] ?? "").trim(),
        campus: String(record["校区"] ?? "").trim(),
        weekText: String(record["上课周次"] ?? "").trim(),
        timeText: String(record["上课时间"] ?? "").trim(),
        locationText: String(record["上课地点"] ?? "").trim()
    };
}

function addPoolQueueItem(type, key) {
    if (poolRenderQueue.some((item) => item.type === type && item.key === key)) {
        return;
    }
    poolRenderQueue.push({ type, key });
}

function removePoolQueueItem(type, key) {
    const index = poolRenderQueue.findIndex((item) => item.type === type && item.key === key);
    if (index >= 0) {
        poolRenderQueue.splice(index, 1);
    }
}

function getClassGroupKey(className) {
    return `class-group|${className}`;
}

function courseMatchesClass(course, className) {
    const raw = String(course["上课班级"] ?? "").trim();
    if (!raw) {
        return false;
    }
    if (raw.includes(className)) {
        return true;
    }
    return splitClasses(raw).includes(className);
}

function buildClassGroup(className) {
    const seen = new Set();
    const courses = [];

    courseList.forEach((course) => {
        if (!courseMatchesClass(course, className)) {
            return;
        }
        const parsed = buildPoolCourse(course);
        if (seen.has(parsed.poolKey)) {
            return;
        }
        seen.add(parsed.poolKey);
        courses.push(parsed);
    });

    return {
        type: "classGroup",
        groupKey: getClassGroupKey(className),
        className,
        courses,
        expanded: false
    };
}

function buildPlanCardForCourseCode(courseCode) {
    const matched = courseList.filter((course) => String(course["课程编号"] ?? "").trim() === courseCode);
    const options = matched.map((course) => buildPoolCourse(course));
    const first = options[0];

    const teacherSet = new Set();
    const campusSet = new Set();
    const timeSet = new Set();
    const classSet = new Set();

    options.forEach((item) => {
        splitTeachers(item.teacher).forEach((teacher) => {
            teacherSet.add(teacher);
        });
        if (item.campus) {
            campusSet.add(item.campus);
        }
        if (item.timeText) {
            timeSet.add(item.timeText);
        }
        if (item.classText) {
            classSet.add(item.classText);
        }
    });

    return {
        type: "planCourse",
        cardKey: `plan-course|${courseCode}`,
        courseCode,
        title: first ? first.title : courseCode,
        options,
        active: true,
        enabledTeachers: new Set(teacherSet),
        enabledCampuses: new Set(campusSet),
        enabledTimes: new Set(timeSet),
        enabledClasses: new Set(classSet),
        expanded: false
    };
}

function syncModeUI() {
    const isPlanMode = scheduleMode === "plan";

    modeTag.textContent = isPlanMode ? "当前模式：自助方案排课" : "当前模式：班级课表调用";
    scheduleModeToggleButton.textContent = isPlanMode ? "切换到班级课表调用" : "切换到自助方案排课";

    courseSearchBar.classList.toggle("is-hidden-preserve", !isPlanMode);
    classSearchBar.classList.toggle("is-hidden-preserve", isPlanMode);
    planCandidateArea.classList.toggle("hidden", !isPlanMode);
    generatePlanTopButton.classList.toggle("is-hidden-preserve", !isPlanMode);
    copyClassToPlanButton.classList.toggle("hidden", isPlanMode);

    classModeToggleButton.classList.toggle("is-active", !isPlanMode);
    scheduleModeToggleButton.classList.toggle("is-active", isPlanMode);

    if (isPlanMode) {
        classSearchInput.value = "";
        hideSuggestions(classSuggestionBox);
    } else {
        courseSearchInput.value = "";
        hideSuggestions(courseSuggestionBox);
    }

    renderPoolToolbar();
    renderPlanCandidates();
    renderCandidatePool();
    renderGridCourses();
}

function showEmpty(box, text) {
    box.innerHTML = `<p class="suggestion-empty">${text}</p>`;
    box.classList.remove("hidden");
}

function hideSuggestions(box) {
    box.classList.add("hidden");
    box.innerHTML = "";
}

function hideAllSuggestions() {
    [courseSuggestionBox, classSuggestionBox].forEach((box) => {
        if (box) {
            hideSuggestions(box);
        }
    });
}

function renderSuggestions(box, list, onPick, emptyText = "未找到匹配项") {
    if (!list.length) {
        showEmpty(box, emptyText);
        return;
    }

    box.innerHTML = "";
    list.forEach((candidate) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "suggestion-item";
        item.textContent = candidate.label;
        item.addEventListener("click", () => {
            onPick(candidate);
            hideSuggestions(box);
        });
        box.appendChild(item);
    });

    box.classList.remove("hidden");
}

function findCourseCandidates(rawQuery) {
    const query = normalize(rawQuery);

    const grouped = new Map();
    courseList.forEach((course) => {
        const code = String(course["课程编号"] ?? "").trim();
        const name = String(course["课程名称"] ?? "").trim();
        if (!code) {
            return;
        }
        if (!normalize(`${code}|${name}`).includes(query)) {
            return;
        }
        if (!grouped.has(code)) {
            grouped.set(code, { code, name });
        }
    });

    return Array.from(grouped.values()).map((item) => ({
        code: item.code,
        label: `${item.code}-${item.name}`
    }));
}

function findClassTimetableCandidates(rawQuery) {
    const query = normalize(rawQuery);
    const classNames = new Set();

    courseList.forEach((course) => {
        const raw = String(course["上课班级"] ?? "").trim();
        if (!raw) {
            return;
        }

        splitClasses(raw).forEach((className) => {
            if (normalize(className).includes(query)) {
                classNames.add(className);
            }
        });

        if (normalize(raw).includes(query)) {
            classNames.add(raw);
        }
    });

    return Array.from(classNames).map((className) => ({ className, label: className }));
}

function createScheduleGrid() {
    if (!scheduleGrid) {
        return;
    }

    scheduleGrid.innerHTML = "";

    WEEK_HEADERS.forEach((title, index) => {
        const head = document.createElement("div");
        head.className = "grid-head";
        head.textContent = title;
        if (index === 0) {
            head.dataset.axis = "corner";
        } else {
            head.dataset.axis = "col";
            head.dataset.day = String(index);
        }
        scheduleGrid.appendChild(head);
    });

    BIG_PERIOD_LABELS.forEach((label, bigPeriod) => {
        const rowHead = document.createElement("div");
        rowHead.className = "grid-head";
        rowHead.textContent = label;
        rowHead.dataset.axis = "row";
        rowHead.dataset.period = String(bigPeriod);
        scheduleGrid.appendChild(rowHead);

        for (let day = 1; day <= 7; day += 1) {
            const slot = document.createElement("div");
            slot.className = "grid-slot";
            slot.dataset.day = String(day);
            slot.dataset.period = String(bigPeriod);
            scheduleGrid.appendChild(slot);
        }
    });
}

function getActiveCoursesForDisplay() {
    const map = new Map();

    if (scheduleMode === "plan") {
        const activePlan = generatedPlans.find((item) => item.id === activePlanId) ||
            conflictingPlans.find((item) => item.id === activePlanId);
        if (activePlan) {
            activePlan.courses.forEach((course) => {
                map.set(course.poolKey, course);
            });
        }

        activePlanClassGroupKeys.forEach((groupKey) => {
            const group = planClassGroups.get(groupKey);
            if (!group) {
                return;
            }

            const excluded = planClassGroupExcludedCourseKeys.get(groupKey) || new Set();
            group.courses.forEach((course) => {
                if (!excluded.has(course.poolKey)) {
                    map.set(course.poolKey, course);
                }
            });
        });

        return Array.from(map.values());
    }

    activeClassGroupKeys.forEach((groupKey) => {
        const group = classGroupPool.get(groupKey);
        if (!group) {
            return;
        }

        const excluded = classGroupExcludedCourseKeys.get(groupKey) || new Set();
        group.courses.forEach((course) => {
            if (!excluded.has(course.poolKey)) {
                map.set(course.poolKey, course);
            }
        });
    });

    return Array.from(map.values());
}

function isEntryVisibleByWeek(entry) {
    if (selectedWeek === "all") {
        return true;
    }

    const weekNumber = Number(selectedWeek);
    if (!Number.isFinite(weekNumber)) {
        return true;
    }

    return entry.weekRanges.some((range) => weekNumber >= range.start && weekNumber <= range.end);
}

function isCellBlocked(day, bigPeriod) {
    return (
        planPreferences.blockedCells.has(`${day}-${bigPeriod}`) ||
        planPreferences.blockedDays.has(day) ||
        planPreferences.blockedPeriods.has(bigPeriod)
    );
}

function refreshBlockedVisuals() {
    scheduleGrid.querySelectorAll(".grid-head").forEach((head) => {
        const axis = head.dataset.axis;
        if (axis === "row") {
            const period = Number(head.dataset.period);
            head.classList.toggle("is-blocked", planPreferences.blockedPeriods.has(period));
        } else if (axis === "col") {
            const day = Number(head.dataset.day);
            head.classList.toggle("is-blocked", planPreferences.blockedDays.has(day));
        }
    });

    scheduleGrid.querySelectorAll(".grid-slot").forEach((slot) => {
        const day = Number(slot.dataset.day);
        const period = Number(slot.dataset.period);
        slot.classList.toggle("is-blocked", isCellBlocked(day, period));
        slot.classList.toggle("is-pref-editable", planPrefEditMode && scheduleMode === "plan");
    });
}

function renderGridCourses() {
    if (!scheduleGrid) {
        return;
    }

    scheduleGrid.querySelectorAll(".grid-slot").forEach((slot) => {
        slot.innerHTML = "";
    });

    // 按 day-period 聚合同一格子内的课程，并记录每门课程在该格子中的最早上课周次
    const slotCourses = new Map();

    const activeCourses = getActiveCoursesForDisplay();

    activeCourses.forEach((course) => {
        course.entries.forEach((entry) => {
            if (!isEntryVisibleByWeek(entry)) {
                return;
            }

            const minWeek = entry.weekRanges.reduce((min, range) => Math.min(min, range.start), Infinity);

            const bigPeriodSet = new Set();
            entry.periods.forEach((period) => {
                const bigPeriod = PERIOD_TO_BIG_PERIOD[period];
                if (bigPeriod !== undefined) {
                    bigPeriodSet.add(bigPeriod);
                }
            });

            bigPeriodSet.forEach((bigPeriod) => {
                const slotKey = `${entry.dayColumn}-${bigPeriod}`;
                if (!slotCourses.has(slotKey)) {
                    slotCourses.set(slotKey, []);
                }
                slotCourses.get(slotKey).push({ course, minWeek: Number.isFinite(minWeek) ? minWeek : 0 });
            });
        });
    });

    slotCourses.forEach((items, slotKey) => {
        const [dayColumn, period] = slotKey.split("-");
        const selector = `.grid-slot[data-day="${dayColumn}"][data-period="${period}"]`;
        const target = scheduleGrid.querySelector(selector);
        if (!target) {
            return;
        }

        items.sort((a, b) => a.minWeek - b.minWeek);

        items.forEach((item, index) => {
            const course = item.course;
            if (index > 0) {
                const divider = document.createElement("hr");
                divider.className = "slot-divider";
                target.appendChild(divider);
            }

            const textBlock = document.createElement("div");
            textBlock.className = "slot-course-text";
            textBlock.innerHTML = `
                <div class="slot-course-title">${course.title}${course.courseCode ? `（${course.courseCode}）` : ""}</div>
                <div class="slot-course-meta">
                    地点：${course.locationText || "-"} | 时间：${course.timeText || "-"} | 教师：${course.teacher || "-"}
                </div>
            `;
            target.appendChild(textBlock);
        });
    });

    refreshBlockedVisuals();
}

function rangesOverlap(a, b) {
    return a.start <= b.end && b.start <= a.end;
}

function intersectRanges(a, b) {
    if (!rangesOverlap(a, b)) {
        return null;
    }
    return {
        start: Math.max(a.start, b.start),
        end: Math.min(a.end, b.end)
    };
}

function summarizeRanges(ranges) {
    return mergeRanges(ranges)
        .map((range) => (range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`))
        .join("、");
}

function summarizePeriodRanges(ranges) {
    return mergeRanges(ranges)
        .map((range) => `第${range.start}${range.start === range.end ? "" : `-${range.end}`}节`)
        .join("、");
}

function buildConflictMap(activeCourses) {
    const conflictMap = new Map();
    activeCourses.forEach((course) => {
        conflictMap.set(course.poolKey, []);
    });

    for (let i = 0; i < activeCourses.length; i += 1) {
        const a = activeCourses[i];
        for (let j = i + 1; j < activeCourses.length; j += 1) {
            const b = activeCourses[j];

            const overlapSegments = [];
            a.entries.forEach((entryA) => {
                b.entries.forEach((entryB) => {
                    if (entryA.dayColumn !== entryB.dayColumn) {
                        return;
                    }

                    const periodOverlaps = [];
                    entryA.periodRanges.forEach((pA) => {
                        entryB.periodRanges.forEach((pB) => {
                            const overlapPeriod = intersectRanges(pA, pB);
                            if (overlapPeriod) {
                                periodOverlaps.push(overlapPeriod);
                            }
                        });
                    });
                    if (!periodOverlaps.length) {
                        return;
                    }

                    const weekOverlaps = [];
                    entryA.weekRanges.forEach((wA) => {
                        entryB.weekRanges.forEach((wB) => {
                            const overlapWeek = intersectRanges(wA, wB);
                            if (!overlapWeek) {
                                return;
                            }
                            weekOverlaps.push(overlapWeek);
                        });
                    });
                    if (!weekOverlaps.length) {
                        return;
                    }

                    overlapSegments.push({
                        dayColumn: entryA.dayColumn,
                        weekRanges: mergeRanges(weekOverlaps),
                        periodRanges: mergeRanges(periodOverlaps)
                    });
                });
            });

            if (!overlapSegments.length) {
                continue;
            }

            conflictMap.get(a.poolKey).push({ withCourse: b, segments: overlapSegments });
            conflictMap.get(b.poolKey).push({ withCourse: a, segments: overlapSegments });
        }
    }

    return conflictMap;
}

function formatConflictMessage(conflicts) {
    if (!conflicts || !conflicts.length) {
        return "";
    }

    return conflicts
        .map((item) => {
            const segmentText = item.segments
                .map((segment) => {
                    const weekText = summarizeRanges(segment.weekRanges);
                    const periodText = summarizePeriodRanges(segment.periodRanges);
                    return `${COLUMN_TO_DAY[segment.dayColumn]} 第${weekText}周 ${periodText}`;
                })
                .join("，");
            return `与“${item.withCourse.title}”于“${segmentText}”冲突`;
        })
        .join("；");
}

function removeClassGroup(groupKey) {
    classGroupPool.delete(groupKey);
    activeClassGroupKeys.delete(groupKey);
    classGroupExcludedCourseKeys.delete(groupKey);
    removePoolQueueItem("classGroup", groupKey);
    renderCandidatePool();
    renderGridCourses();
}

function removePlanCard(cardKey) {
    planCourseCards.delete(cardKey);
    activePlanCourseCardKeys.delete(cardKey);
    if (!planCourseCards.size) {
        generatedPlans.length = 0;
        activePlanId = "";
    }
    renderCandidatePool();
    renderPlanCandidates();
    renderGridCourses();
}

function toggleClassGroup(groupKey) {
    if (activeClassGroupKeys.has(groupKey)) {
        activeClassGroupKeys.delete(groupKey);
    } else {
        activeClassGroupKeys.add(groupKey);
    }
    renderCandidatePool();
    renderGridCourses();
}

function toggleClassGroupExpand(groupKey) {
    const group = classGroupPool.get(groupKey);
    if (!group) {
        return;
    }
    group.expanded = !group.expanded;
    renderCandidatePool();
}

function toggleClassGroupCourse(groupKey, poolKey) {
    if (!activeClassGroupKeys.has(groupKey)) {
        activeClassGroupKeys.add(groupKey);
    }

    const excluded = classGroupExcludedCourseKeys.get(groupKey) || new Set();
    if (excluded.has(poolKey)) {
        excluded.delete(poolKey);
    } else {
        excluded.add(poolKey);
    }
    classGroupExcludedCourseKeys.set(groupKey, excluded);

    renderCandidatePool();
    renderGridCourses();
}

function removePlanClassGroup(groupKey) {
    planClassGroups.delete(groupKey);
    activePlanClassGroupKeys.delete(groupKey);
    planClassGroupExcludedCourseKeys.delete(groupKey);
    renderCandidatePool();
    renderGridCourses();
}

function togglePlanClassGroup(groupKey) {
    if (activePlanClassGroupKeys.has(groupKey)) {
        activePlanClassGroupKeys.delete(groupKey);
    } else {
        activePlanClassGroupKeys.add(groupKey);
    }
    renderCandidatePool();
    renderGridCourses();
}

function togglePlanClassGroupExpand(groupKey) {
    const group = planClassGroups.get(groupKey);
    if (!group) {
        return;
    }
    group.expanded = !group.expanded;
    renderCandidatePool();
}

function togglePlanClassGroupCourse(groupKey, poolKey) {
    if (!activePlanClassGroupKeys.has(groupKey)) {
        activePlanClassGroupKeys.add(groupKey);
    }

    const excluded = planClassGroupExcludedCourseKeys.get(groupKey) || new Set();
    if (excluded.has(poolKey)) {
        excluded.delete(poolKey);
    } else {
        excluded.add(poolKey);
    }
    planClassGroupExcludedCourseKeys.set(groupKey, excluded);

    renderCandidatePool();
    renderGridCourses();
}

function togglePlanCard(cardKey) {
    const card = planCourseCards.get(cardKey);
    if (!card) {
        return;
    }
    card.active = !card.active;

    if (card.active) {
        activePlanCourseCardKeys.add(cardKey);
    } else {
        activePlanCourseCardKeys.delete(cardKey);
    }

    renderCandidatePool();
}

function togglePlanFilter(cardKey, filterType, option) {
    const card = planCourseCards.get(cardKey);
    if (!card) {
        return;
    }

    let setRef = card.enabledTeachers;
    if (filterType === "campus") {
        setRef = card.enabledCampuses;
    } else if (filterType === "time") {
        setRef = card.enabledTimes;
    } else if (filterType === "class") {
        setRef = card.enabledClasses;
    }

    if (setRef.has(option)) {
        setRef.delete(option);
    } else {
        setRef.add(option);
    }

    renderCandidatePool();
}

function expandPlanCard(cardKey) {
    const card = planCourseCards.get(cardKey);
    if (!card) {
        return;
    }
    card.expanded = !card.expanded;
    renderCandidatePool();
}

function renderWeekFilter() {
    weekFilter.innerHTML = "";

    const options = [{ value: "all", label: "全部" }];
    for (let week = 1; week <= maxWeek; week += 1) {
        options.push({ value: String(week), label: `${week}周` });
    }

    options.forEach((option) => {
        const label = document.createElement("label");
        label.className = "week-chip";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = "weekLocator";
        input.value = option.value;
        input.checked = selectedWeek === option.value;
        input.addEventListener("change", () => {
            selectedWeek = option.value;
            renderGridCourses();
            renderCandidatePool();
        });

        const span = document.createElement("span");
        span.textContent = option.label;

        label.appendChild(input);
        label.appendChild(span);
        weekFilter.appendChild(label);
    });

    if (weekSummary) {
        if (selectedWeek === "all") {
            weekSummary.textContent = "周次筛选：全部";
        } else {
            weekSummary.textContent = `周次定位：第${selectedWeek}周`;
        }
    }
}

function clearAllCards() {
    classGroupPool.clear();
    activeClassGroupKeys.clear();
    classGroupExcludedCourseKeys.clear();
    poolRenderQueue.length = 0;
    planCourseCards.clear();
    activePlanCourseCardKeys.clear();
    generatedPlans.length = 0;
    conflictingPlans.length = 0;
    activePlanId = "";
    planClassGroups.clear();
    activePlanClassGroupKeys.clear();
    planClassGroupExcludedCourseKeys.clear();
    renderCandidatePool();
    renderPlanCandidates();
    renderGridCourses();
}

function clearClassModePool() {
    classGroupPool.clear();
    activeClassGroupKeys.clear();
    classGroupExcludedCourseKeys.clear();
    poolRenderQueue.length = 0;
    renderCandidatePool();
    renderGridCourses();
}

function selectAllClassGroups() {
    classGroupPool.forEach((group) => {
        activeClassGroupKeys.add(group.groupKey);
        classGroupExcludedCourseKeys.set(group.groupKey, new Set());
    });
    renderCandidatePool();
    renderGridCourses();
}

function toggleCampusPreference(value) {
    if (value === "无") {
        planPreferences.campus.clear();
        planPreferences.campus.add("无");
        renderPoolToolbar();
        return;
    }

    if (planPreferences.campus.has("无")) {
        planPreferences.campus.delete("无");
    }

    if (planPreferences.campus.has(value)) {
        planPreferences.campus.delete(value);
    } else {
        planPreferences.campus.add(value);
    }

    if (!planPreferences.campus.size) {
        planPreferences.campus.add("无");
    }

    renderPoolToolbar();
}

function togglePreferenceEditMode() {
    planPrefEditMode = !planPrefEditMode;
    renderPoolToolbar();
    refreshBlockedVisuals();
}

function resetPlanPreferences() {
    planPreferences.campus.clear();
    planPreferences.campus.add("无");
    planPreferences.blockedCells.clear();
    planPreferences.blockedDays.clear();
    planPreferences.blockedPeriods.clear();
    planPrefEditMode = false;
    renderPoolToolbar();
    refreshBlockedVisuals();
    showToast("已重置为默认偏好（无偏好）");
}

function generatePlans() {
    if (planPrefEditMode) {
        showToast("请先保存时间段偏好后再生成方案");
        return;
    }

    const activeCards = Array.from(planCourseCards.values()).filter((card) => card.active);
    generatedPlans.length = 0;
    conflictingPlans.length = 0;
    activePlanId = "";

    if (!activeCards.length) {
        renderPlanCandidates("不存在满足要求的课程方案", true);
        renderGridCourses();
        return;
    }

    const campusNoPreference = planPreferences.campus.has("无");
    const campusTargets = campusNoPreference ? [] : Array.from(planPreferences.campus);

    const candidatesPerCard = activeCards.map((card) => {
        const options = card.options.filter((course) => {
            const teacherMatch = !card.enabledTeachers.size || splitTeachers(course.teacher).some((teacher) => card.enabledTeachers.has(teacher));
            const campusMatch = !card.enabledCampuses.size || card.enabledCampuses.has(course.campus);
            const timeMatch = !card.enabledTimes.size || card.enabledTimes.has(course.timeText);
            const classMatch = !card.enabledClasses.size || card.enabledClasses.has(course.classText);
            const campusPrefMatch = campusNoPreference || campusTargets.includes(course.campus);

            if (!(teacherMatch && campusMatch && timeMatch && classMatch && campusPrefMatch)) {
                return false;
            }

            // 检查阻塞时段时不再受当前周次筛选影响，确保整个学期内都不落在阻塞时段
            for (let i = 0; i < course.entries.length; i += 1) {
                const entry = course.entries[i];
                for (let p = 0; p < entry.periods.length; p += 1) {
                    const bigPeriod = PERIOD_TO_BIG_PERIOD[entry.periods[p]];
                    if (bigPeriod !== undefined && isCellBlocked(entry.dayColumn, bigPeriod)) {
                        return false;
                    }
                }
            }
            return true;
        });

        return { card, options };
    });

    if (candidatesPerCard.some((item) => !item.options.length)) {
        renderPlanCandidates("不存在满足要求的课程方案", true);
        renderGridCourses();
        return;
    }

    const maxPlansPerCategory = 20;

    // 收集已激活的班级课程组课程，这些课程在方案模式下视为固定占用，生成方案时必须避开
    const fixedCourses = [];
    activePlanClassGroupKeys.forEach((groupKey) => {
        const group = planClassGroups.get(groupKey);
        if (!group) {
            return;
        }
        const excluded = planClassGroupExcludedCourseKeys.get(groupKey) || new Set();
        group.courses.forEach((course) => {
            if (!excluded.has(course.poolKey)) {
                fixedCourses.push(course);
            }
        });
    });

    function courseEntriesConflict(a, b) {
        for (let e1 = 0; e1 < a.entries.length; e1 += 1) {
            for (let e2 = 0; e2 < b.entries.length; e2 += 1) {
                const entryA = a.entries[e1];
                const entryB = b.entries[e2];
                if (entryA.dayColumn !== entryB.dayColumn) {
                    continue;
                }

                const periodOverlap = entryA.periodRanges.some((pa) => entryB.periodRanges.some((pb) => rangesOverlap(pa, pb)));
                if (!periodOverlap) {
                    continue;
                }

                // 检测全学期冲突，不再受当前周次筛选影响
                const weekOverlap = entryA.weekRanges.some((wa) => entryB.weekRanges.some((wb) => intersectRanges(wa, wb) !== null));
                if (weekOverlap) {
                    return true;
                }
            }
        }
        return false;
    }

    function backtrack(index, selected) {
        if (generatedPlans.length >= maxPlansPerCategory && conflictingPlans.length >= maxPlansPerCategory) {
            return;
        }

        if (index >= candidatesPerCard.length) {
            let hasConflict = false;

            // 检查已选课程之间是否存在冲突（支持跨多个大节的大课）
            for (let i = 0; i < selected.length && !hasConflict; i += 1) {
                for (let j = i + 1; j < selected.length && !hasConflict; j += 1) {
                    if (courseEntriesConflict(selected[i], selected[j])) {
                        hasConflict = true;
                    }
                }
            }

            // 检查已选课程与固定班级课程组课程是否冲突
            for (let i = 0; i < selected.length && !hasConflict; i += 1) {
                for (let f = 0; f < fixedCourses.length && !hasConflict; f += 1) {
                    if (courseEntriesConflict(selected[i], fixedCourses[f])) {
                        hasConflict = true;
                    }
                }
            }

            if (!hasConflict && generatedPlans.length < maxPlansPerCategory) {
                const id = `plan-${generatedPlans.length + 1}`;
                generatedPlans.push({
                    id,
                    name: `方案${generatedPlans.length + 1}`,
                    courses: selected.map((item) => item)
                });
            } else if (hasConflict && conflictingPlans.length < maxPlansPerCategory) {
                const id = `conflict-${conflictingPlans.length + 1}`;
                conflictingPlans.push({
                    id,
                    name: `冲突方案${conflictingPlans.length + 1}`,
                    courses: selected.map((item) => item)
                });
            }
            return;
        }

        const current = candidatesPerCard[index];
        for (let i = 0; i < current.options.length; i += 1) {
            const candidate = current.options[i];
            selected.push(candidate);
            backtrack(index + 1, selected);
            selected.pop();
            if (generatedPlans.length >= maxPlansPerCategory && conflictingPlans.length >= maxPlansPerCategory) {
                return;
            }
        }
    }

    backtrack(0, []);

    if (!generatedPlans.length && !conflictingPlans.length) {
        renderPlanCandidates("不存在满足要求的课程方案", true);
        renderGridCourses();
        return;
    }

    activePlanId = generatedPlans.length ? generatedPlans[0].id : conflictingPlans[0].id;
    renderPlanCandidates();
    renderGridCourses();
}

function renderPoolToolbar() {
    poolToolbar.innerHTML = "";

    if (scheduleMode === "class") {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "pool-btn pool-btn-fixed";
        clearBtn.textContent = "一键清除";
        clearBtn.addEventListener("click", clearClassModePool);

        const selectAllBtn = document.createElement("button");
        selectAllBtn.type = "button";
        selectAllBtn.className = "pool-btn pool-btn-fixed";
        selectAllBtn.textContent = "全选";
        selectAllBtn.addEventListener("click", selectAllClassGroups);

        poolToolbar.appendChild(clearBtn);
        poolToolbar.appendChild(selectAllBtn);
        return;
    }

    const campusDropdown = document.createElement("details");
    campusDropdown.className = "dropdown-multi is-toolbar";

    const campusSummary = document.createElement("summary");
    const campusValues = Array.from(planPreferences.campus);
    const campusLabel = campusValues.includes("无")
        ? "校区偏好：无"
        : `校区偏好：${campusValues.join("/") || "无"}`;
    campusSummary.textContent = campusLabel;
    campusDropdown.appendChild(campusSummary);

    const campusPanel = document.createElement("div");
    campusPanel.className = "dropdown-panel";
    ["无", "东校区", "西校区"].forEach((campus) => {
        const label = document.createElement("label");
        label.className = "pool-check";

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = planPreferences.campus.has(campus);
        check.addEventListener("change", () => {
            toggleCampusPreference(campus);
        });

        const text = document.createElement("span");
        text.textContent = campus;

        label.appendChild(check);
        label.appendChild(text);
        campusPanel.appendChild(label);
    });

    campusDropdown.appendChild(campusPanel);

    const prefBtn = document.createElement("button");
    prefBtn.type = "button";
    prefBtn.className = "pool-btn pool-btn-wide";
    prefBtn.textContent = planPrefEditMode ? "保存" : "时间段偏好";
    prefBtn.classList.toggle("is-active", planPrefEditMode);
    prefBtn.addEventListener("click", () => {
        togglePreferenceEditMode();
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "pool-btn pool-btn-fixed";
    resetBtn.textContent = "重置偏好";
    resetBtn.addEventListener("click", resetPlanPreferences);

    poolToolbar.appendChild(campusDropdown);
    poolToolbar.appendChild(prefBtn);
    poolToolbar.appendChild(resetBtn);
}

function bindInputClear(clearButton, inputElement, suggestionBox) {
    if (!clearButton || !inputElement) {
        return;
    }

    clearButton.addEventListener("click", () => {
        inputElement.value = "";
        if (suggestionBox) {
            hideSuggestions(suggestionBox);
        }
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
        inputElement.focus();
    });
}

function renderPlanCandidates(errorText = "", isError = false) {
    if (scheduleMode !== "plan") {
        return;
    }

    planCandidateArea.innerHTML = "";

    if (errorText) {
        const msg = document.createElement("p");
        msg.className = "plan-empty is-error";
        msg.textContent = errorText;
        planCandidateArea.appendChild(msg);
        return;
    }

    if (!generatedPlans.length && !conflictingPlans.length) {
        const empty = document.createElement("p");
        empty.className = "plan-empty";
        empty.textContent = "方案候选区：点击“生成方案”后显示可用排课方案";
        planCandidateArea.appendChild(empty);
        return;
    }

    function createPill(plan, isConflict) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "plan-pill";
        if (isConflict) {
            pill.style.borderColor = "rgba(204, 47, 47, 0.6)";
            pill.style.background = "rgba(255, 242, 242, 0.95)";
            pill.style.color = "#9e1e1e";
        }
        pill.textContent = `${plan.name}（${plan.courses.length}门）`;
        pill.classList.toggle("is-active", activePlanId === plan.id);
        pill.addEventListener("click", () => {
            activePlanId = plan.id;
            renderPlanCandidates();
            renderGridCourses();
        });
        return pill;
    }

    if (generatedPlans.length) {
        const freeLabel = document.createElement("p");
        freeLabel.className = "plan-empty";
        freeLabel.textContent = "无冲突方案：";
        freeLabel.style.fontWeight = "700";
        freeLabel.style.marginRight = "8px";
        planCandidateArea.appendChild(freeLabel);

        generatedPlans.forEach((plan) => {
            planCandidateArea.appendChild(createPill(plan, false));
        });
    }

    if (conflictingPlans.length) {
        if (generatedPlans.length) {
            const divider = document.createElement("span");
            divider.className = "plan-empty";
            divider.textContent = "|";
            divider.style.margin = "0 8px";
            divider.style.opacity = "0.5";
            planCandidateArea.appendChild(divider);
        }

        const conflictLabel = document.createElement("p");
        conflictLabel.className = "plan-empty";
        conflictLabel.textContent = "冲突方案：";
        conflictLabel.style.fontWeight = "700";
        conflictLabel.style.marginRight = "8px";
        conflictLabel.style.color = "#9e1e1e";
        planCandidateArea.appendChild(conflictLabel);

        conflictingPlans.forEach((plan) => {
            planCandidateArea.appendChild(createPill(plan, true));
        });
    }
}

function collectConflictTargetsForClassMode() {
    const activeCourses = getActiveCoursesForDisplay();
    const map = buildConflictMap(activeCourses);
    const groupConflicts = new Map();

    classGroupPool.forEach((group, groupKey) => {
        const groupMessages = [];
        group.courses.forEach((course) => {
            const messages = map.get(course.poolKey) || [];
            messages.forEach((item) => {
                groupMessages.push(item);
            });
        });
        groupConflicts.set(groupKey, groupMessages);
    });

    return groupConflicts;
}

function collectConflictTargetsForPlanMode() {
    const activeCourses = getActiveCoursesForDisplay();
    const map = buildConflictMap(activeCourses);
    const planConflictMap = new Map();

    activeCourses.forEach((course) => {
        planConflictMap.set(course.poolKey, map.get(course.poolKey) || []);
    });

    return planConflictMap;
}

function renderCandidatePool() {
    if (!candidatePool) {
        return;
    }

    candidatePool.innerHTML = "";

    if (scheduleMode === "plan") {
        const planConflicts = collectConflictTargetsForPlanMode();

        if (!planCourseCards.size && !planClassGroups.size) {
            candidatePool.innerHTML = "<p class=\"empty-pool\">课程检索后将按课程编号整合成卡片，并在此设置偏好；也可从班级课表调用模式复制班级课程组到此处。</p>";
            return;
        }

        Array.from(planCourseCards.values()).forEach((card) => {
            const wrapper = document.createElement("article");
            wrapper.className = "plan-course-card";
            if (!card.active) {
                wrapper.style.opacity = "0.65";
            }

            const perCardConflicts = [];
            const activePlan = generatedPlans.find((item) => item.id === activePlanId) ||
                conflictingPlans.find((item) => item.id === activePlanId);
            if (activePlan) {
                activePlan.courses.forEach((course) => {
                    if (course.courseCode === card.courseCode) {
                        const one = planConflicts.get(course.poolKey) || [];
                        one.forEach((entry) => perCardConflicts.push(entry));
                    }
                });
            }

            if (perCardConflicts.length) {
                wrapper.classList.add("is-conflict");
            }

            const head = document.createElement("div");
            head.className = "card-head";

            const title = document.createElement("h3");
            title.className = "card-title";
            title.textContent = `${card.courseCode}-${card.title}`;

            const actionWrap = document.createElement("div");
            actionWrap.style.display = "flex";
            actionWrap.style.gap = "6px";

            const pickBtn = document.createElement("button");
            pickBtn.type = "button";
            pickBtn.className = "group-action-btn";
            pickBtn.textContent = card.active ? "取消" : "选中";
            pickBtn.addEventListener("click", () => {
                togglePlanCard(card.cardKey);
            });

            const expandBtn = document.createElement("button");
            expandBtn.type = "button";
            expandBtn.className = "group-action-btn";
            expandBtn.textContent = card.expanded ? "收起" : "展开";
            expandBtn.addEventListener("click", () => {
                expandPlanCard(card.cardKey);
            });

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "danger-btn";
            delBtn.textContent = "删除";
            delBtn.addEventListener("click", () => {
                removePlanCard(card.cardKey);
            });

            actionWrap.appendChild(pickBtn);
            actionWrap.appendChild(expandBtn);
            actionWrap.appendChild(delBtn);

            head.appendChild(title);
            head.appendChild(actionWrap);
            wrapper.appendChild(head);

            const info = document.createElement("p");
            info.className = "plan-card-meta";
            info.textContent = `备选通知单：${card.options.length}`;
            wrapper.appendChild(info);

            if (card.expanded) {
                const teacherOptions = new Set();
                const campusOptions = new Set();
                const timeOptions = new Set();
                const classOptions = new Set();

                card.options.forEach((course) => {
                    splitTeachers(course.teacher).forEach((teacher) => teacherOptions.add(teacher));
                    if (course.campus) {
                        campusOptions.add(course.campus);
                    }
                    if (course.timeText) {
                        timeOptions.add(course.timeText);
                    }
                    if (course.classText) {
                        classOptions.add(course.classText);
                    }
                });

                function appendFilter(titleText, values, selectedSet, kind) {
                    const row = document.createElement("div");
                    row.className = "plan-filter-row";

                    const titleLabel = document.createElement("div");
                    titleLabel.className = "plan-filter-title";
                    titleLabel.textContent = titleText;

                    const box = document.createElement("div");
                    box.className = "plan-filter-options";

                    Array.from(values).forEach((value) => {
                        const label = document.createElement("label");
                        const check = document.createElement("input");
                        check.type = "checkbox";
                        check.checked = selectedSet.has(value);
                        check.addEventListener("change", () => {
                            togglePlanFilter(card.cardKey, kind, value);
                        });

                        const text = document.createElement("span");
                        text.textContent = value || "未标注";

                        label.appendChild(check);
                        label.appendChild(text);
                        box.appendChild(label);
                    });

                    row.appendChild(titleLabel);
                    row.appendChild(box);
                    wrapper.appendChild(row);
                }

                appendFilter("授课教师", teacherOptions, card.enabledTeachers, "teacher");
                appendFilter("上课时间段", timeOptions, card.enabledTimes, "time");
                appendFilter("上课班级", classOptions, card.enabledClasses, "class");
                appendFilter("校区", campusOptions, card.enabledCampuses, "campus");
            }

            if (perCardConflicts.length) {
                const conflict = document.createElement("p");
                conflict.className = "conflict-message";
                conflict.textContent = formatConflictMessage(perCardConflicts);
                wrapper.appendChild(conflict);
            }

            candidatePool.appendChild(wrapper);
        });

        if (planClassGroups.size) {
            const groupConflicts = collectConflictTargetsForPlanMode();

            const sectionTitle = document.createElement("h3");
            sectionTitle.className = "sidebar-title";
            sectionTitle.style.marginTop = "10px";
            sectionTitle.textContent = "来自班级课表的课程组";
            candidatePool.appendChild(sectionTitle);

            planClassGroups.forEach((group) => {
                const wrapper = document.createElement("article");
                wrapper.className = "class-group-card";
                const isActive = activePlanClassGroupKeys.has(group.groupKey);
                if (isActive) {
                    wrapper.classList.add("is-active");
                }

                const conflicts = [];
                const excluded = planClassGroupExcludedCourseKeys.get(group.groupKey) || new Set();
                group.courses.forEach((course) => {
                    if (!excluded.has(course.poolKey)) {
                        const courseConflicts = groupConflicts.get(course.poolKey) || [];
                        courseConflicts.forEach((item) => conflicts.push(item));
                    }
                });
                if (conflicts.length) {
                    wrapper.classList.add("is-conflict");
                }

                const head = document.createElement("div");
                head.className = "class-group-head";

                const title = document.createElement("h3");
                title.className = "card-title";
                title.textContent = `班级课表：${group.className}`;

                const actions = document.createElement("div");
                actions.className = "class-group-actions";

                const selectBtn = document.createElement("button");
                selectBtn.type = "button";
                selectBtn.className = "group-action-btn";
                selectBtn.textContent = isActive ? "取消整班" : "选中整班";
                selectBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    togglePlanClassGroup(group.groupKey);
                });

                const expandBtn = document.createElement("button");
                expandBtn.type = "button";
                expandBtn.className = "group-action-btn";
                expandBtn.textContent = group.expanded ? "收起" : "展开";
                expandBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    togglePlanClassGroupExpand(group.groupKey);
                });

                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "danger-btn";
                delBtn.textContent = "删除";
                delBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    removePlanClassGroup(group.groupKey);
                });

                actions.appendChild(selectBtn);
                actions.appendChild(expandBtn);
                actions.appendChild(delBtn);

                head.appendChild(title);
                head.appendChild(actions);
                wrapper.appendChild(head);

                const info = document.createElement("p");
                info.className = "class-group-meta";
                info.textContent = `课程数：${group.courses.length}，当前启用：${Math.max(group.courses.length - excluded.size, 0)}`;
                wrapper.appendChild(info);

                if (group.expanded) {
                    const list = document.createElement("div");
                    list.className = "class-group-list";
                    group.courses.forEach((course) => {
                        const isOff = excluded.has(course.poolKey) || !isActive;
                        const itemBtn = document.createElement("button");
                        itemBtn.type = "button";
                        itemBtn.className = "class-group-course-item";
                        if (isOff) {
                            itemBtn.classList.add("is-off");
                        }
                        itemBtn.innerHTML = `
                            <div class="class-group-course-title">${course.title}</div>
                            <div class="class-group-course-meta">${course.timeText || ""}</div>
                        `;
                        itemBtn.addEventListener("click", () => {
                            togglePlanClassGroupCourse(group.groupKey, course.poolKey);
                        });
                        list.appendChild(itemBtn);
                    });
                    wrapper.appendChild(list);
                }

                if (conflicts.length) {
                    const conflict = document.createElement("p");
                    conflict.className = "conflict-message";
                    conflict.textContent = formatConflictMessage(conflicts);
                    wrapper.appendChild(conflict);
                }

                candidatePool.appendChild(wrapper);
            });
        }

        return;
    }

    if (!poolRenderQueue.length) {
        candidatePool.innerHTML = "<p class=\"empty-pool\">从顶部搜索框选择班级后，将在此生成班级课表卡片。</p>";
        return;
    }

    const groupConflicts = collectConflictTargetsForClassMode();

    poolRenderQueue.forEach((item) => {
        const group = classGroupPool.get(item.key);
        if (!group) {
            return;
        }

        const wrapper = document.createElement("article");
        wrapper.className = "class-group-card";
        const isActive = activeClassGroupKeys.has(group.groupKey);
        if (isActive) {
            wrapper.classList.add("is-active");
        }

        const conflicts = groupConflicts.get(group.groupKey) || [];
        if (conflicts.length) {
            wrapper.classList.add("is-conflict");
        }

        const head = document.createElement("div");
        head.className = "class-group-head";

        const title = document.createElement("h3");
        title.className = "card-title";
        title.textContent = `班级课表：${group.className}`;

        const actions = document.createElement("div");
        actions.className = "class-group-actions";

        const selectBtn = document.createElement("button");
        selectBtn.type = "button";
        selectBtn.className = "group-action-btn";
        selectBtn.textContent = isActive ? "取消整班" : "选中整班";
        selectBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleClassGroup(group.groupKey);
        });

        const expandBtn = document.createElement("button");
        expandBtn.type = "button";
        expandBtn.className = "group-action-btn";
        expandBtn.textContent = group.expanded ? "收起" : "展开";
        expandBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleClassGroupExpand(group.groupKey);
        });

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "danger-btn";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            removeClassGroup(group.groupKey);
        });

        actions.appendChild(selectBtn);
        actions.appendChild(expandBtn);
        actions.appendChild(delBtn);

        head.appendChild(title);
        head.appendChild(actions);
        wrapper.appendChild(head);

        const excluded = classGroupExcludedCourseKeys.get(group.groupKey) || new Set();
        const info = document.createElement("p");
        info.className = "class-group-meta";
        info.textContent = `课程数：${group.courses.length}，当前启用：${Math.max(group.courses.length - excluded.size, 0)}`;
        wrapper.appendChild(info);

        if (group.expanded) {
            const list = document.createElement("div");
            list.className = "class-group-list";
            group.courses.forEach((course) => {
                const isOff = excluded.has(course.poolKey) || !isActive;
                const itemBtn = document.createElement("button");
                itemBtn.type = "button";
                itemBtn.className = "class-group-course-item";
                if (isOff) {
                    itemBtn.classList.add("is-off");
                }
                itemBtn.innerHTML = `
                    <div class="class-group-course-title">${course.title}</div>
                    <div class="class-group-course-meta">${course.timeText || ""}</div>
                `;
                itemBtn.addEventListener("click", () => {
                    toggleClassGroupCourse(group.groupKey, course.poolKey);
                });
                list.appendChild(itemBtn);
            });
            wrapper.appendChild(list);
        }

        if (conflicts.length) {
            const conflict = document.createElement("p");
            conflict.className = "conflict-message";
            conflict.textContent = formatConflictMessage(conflicts);
            wrapper.appendChild(conflict);
        }

        candidatePool.appendChild(wrapper);
    });
}

function ingestClassGroupFromPick(className) {
    const groupKey = getClassGroupKey(className);
    let group = classGroupPool.get(groupKey);

    if (!group) {
        group = buildClassGroup(className);
        classGroupPool.set(groupKey, group);
        classGroupExcludedCourseKeys.set(groupKey, new Set());
        addPoolQueueItem("classGroup", groupKey);
    }

    activeClassGroupKeys.add(groupKey);
    renderCandidatePool();
    renderGridCourses();
}

function ingestPlanCardFromCourseCode(courseCode, label) {
    const cardKey = `plan-course|${courseCode}`;
    let card = planCourseCards.get(cardKey);
    if (!card) {
        card = buildPlanCardForCourseCode(courseCode);
        planCourseCards.set(cardKey, card);
    }

    card.active = true;
    activePlanCourseCardKeys.add(cardKey);

    window.selectedCourseRecord = card.options[0] ? card.options[0].record : null;
    window.selectedCourseKeyValuePairs = card.options[0] ? Object.entries(card.options[0].record) : [];

    renderCandidatePool();
}

function copyClassGroupsToPlan() {
    let copiedGroupCount = 0;
    let copiedCourseCount = 0;

    activeClassGroupKeys.forEach((groupKey) => {
        const group = classGroupPool.get(groupKey);
        if (!group) {
            return;
        }

        const excluded = classGroupExcludedCourseKeys.get(groupKey) || new Set();
        const planGroupKey = getClassGroupKey(group.className);

        // 深复制课程列表与排除状态到 plan 模式班级组
        planClassGroups.set(planGroupKey, {
            type: "classGroup",
            groupKey: planGroupKey,
            className: group.className,
            courses: group.courses.map((course) => ({ ...course })),
            expanded: false
        });
        planClassGroupExcludedCourseKeys.set(planGroupKey, new Set(excluded));
        activePlanClassGroupKeys.add(planGroupKey);

        copiedGroupCount += 1;
        copiedCourseCount += group.courses.length - excluded.size;
    });

    if (!copiedGroupCount) {
        showToast("班级课表中没有已启用的课程可复制");
        return;
    }

    showToast(`已复制 ${copiedGroupCount} 个班级课表组（${copiedCourseCount} 门课程）到方案池`);

    scheduleMode = "plan";
    planPrefEditMode = false;
    hideAllSuggestions();
    syncModeUI();
}

function filterCourseInput(rawQuery) {
    if (scheduleMode !== "plan") {
        return;
    }

    const query = normalize(rawQuery);
    if (!query) {
        hideSuggestions(courseSuggestionBox);
        return;
    }

    if (!courseList.length) {
        showEmpty(courseSuggestionBox, "课程数据加载中，请稍候...");
        return;
    }

    const candidates = findCourseCandidates(query).slice(0, 50);
    renderSuggestions(courseSuggestionBox, candidates, (candidate) => {
        courseSearchInput.value = candidate.label;
        ingestPlanCardFromCourseCode(candidate.code, candidate.label);
    }, "未找到匹配课程");
}

function filterClassInput(rawQuery) {
    if (scheduleMode !== "class") {
        return;
    }

    const query = normalize(rawQuery);
    if (!query) {
        hideSuggestions(classSuggestionBox);
        return;
    }

    const candidates = findClassTimetableCandidates(query).slice(0, 50);
    renderSuggestions(classSuggestionBox, candidates, (candidate) => {
        classSearchInput.value = candidate.className;
        ingestClassGroupFromPick(candidate.className);
    }, "未找到匹配班级");
}

function extractMaxWeekFromCourses(list) {
    let max = 20;
    list.forEach((course) => {
        const weekText = String(course["上课周次"] ?? "").trim();
        weekText.split(",").forEach((token) => {
            const values = parseRangeToken(token);
            values.forEach((value) => {
                if (value > max) {
                    max = value;
                }
            });
        });
    });
    return Math.min(Math.max(max, 20), 30);
}

async function loadCourseData() {
    try {
        const versionStamp = typeof APP_VERSION !== "undefined" ? APP_VERSION : "";
        const dataUrl = versionStamp ? `${COURSE_DATA_PATH}?v=${versionStamp}` : COURSE_DATA_PATH;
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error(`课程数据加载失败: ${response.status}`);
        }

        const data = await response.json();
        courseList = Array.isArray(data) ? data : [];
        maxWeek = extractMaxWeekFromCourses(courseList);
        renderWeekFilter();
    } catch (error) {
        console.error(error);
        showEmpty(courseSuggestionBox, "课程数据加载失败，请检查文件路径或本地服务");
    }
}

function handleGridPreferenceInteraction(target) {
    if (!planPrefEditMode || scheduleMode !== "plan") {
        return;
    }

    if (target.classList.contains("grid-slot")) {
        const day = Number(target.dataset.day);
        const period = Number(target.dataset.period);
        const key = `${day}-${period}`;
        if (planPreferences.blockedCells.has(key)) {
            planPreferences.blockedCells.delete(key);
        } else {
            planPreferences.blockedCells.add(key);
        }
        refreshBlockedVisuals();
        return;
    }

    if (target.classList.contains("grid-head")) {
        const axis = target.dataset.axis;
        if (axis === "row") {
            const period = Number(target.dataset.period);
            if (planPreferences.blockedPeriods.has(period)) {
                planPreferences.blockedPeriods.delete(period);
            } else {
                planPreferences.blockedPeriods.add(period);
            }
            refreshBlockedVisuals();
            return;
        }

        if (axis === "col") {
            const day = Number(target.dataset.day);
            if (planPreferences.blockedDays.has(day)) {
                planPreferences.blockedDays.delete(day);
            } else {
                planPreferences.blockedDays.add(day);
            }
            refreshBlockedVisuals();
        }
    }
}

if (
    scheduleModeToggleButton &&
    classModeToggleButton &&
    modeTag &&
    planCandidateArea &&
    courseSearchInput &&
    classSearchInput &&
    courseSuggestionBox &&
    classSuggestionBox &&
    courseSearchClear &&
    classSearchClear &&
    clearPoolTopButton &&
    generatePlanTopButton &&
    copyClassToPlanButton &&
    exportTimetableButton &&
    weekFilter &&
    poolToolbar &&
    scheduleGrid &&
    candidatePool
) {
    createScheduleGrid();
    renderWeekFilter();
    syncModeUI();

    courseSearchInput.addEventListener("input", (event) => {
        filterCourseInput(event.target.value);
    });

    classSearchInput.addEventListener("input", (event) => {
        filterClassInput(event.target.value);
    });

    classModeToggleButton.addEventListener("click", () => {
        if (scheduleMode !== "class") {
            scheduleMode = "class";
            planPrefEditMode = false;
            hideAllSuggestions();
            syncModeUI();
        } else {
            showToast("当前已是班级课表调用模式");
        }
    });

    scheduleModeToggleButton.addEventListener("click", () => {
        scheduleMode = scheduleMode === "plan" ? "class" : "plan";
        planPrefEditMode = false;
        hideAllSuggestions();
        syncModeUI();
    });

    copyClassToPlanButton.addEventListener("click", () => {
        copyClassGroupsToPlan();
    });

    exportTimetableButton.addEventListener("click", () => {
        exportTimetable();
    });

    clearPoolTopButton.addEventListener("click", () => {
        clearAllCards();
    });

    generatePlanTopButton.addEventListener("click", () => {
        if (scheduleMode === "plan") {
            generatePlans();
        }
    });

    bindInputClear(courseSearchClear, courseSearchInput, courseSuggestionBox);
    bindInputClear(classSearchClear, classSearchInput, classSuggestionBox);

    scheduleGrid.addEventListener("click", (event) => {
        const target = event.target.closest(".grid-slot, .grid-head");
        if (!target) {
            return;
        }
        handleGridPreferenceInteraction(target);
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".search-bar")) {
            hideAllSuggestions();
        }
    });

    loadCourseData();
} else {
    console.warn("排课表工具初始化所需 DOM 元素不完整");
}
