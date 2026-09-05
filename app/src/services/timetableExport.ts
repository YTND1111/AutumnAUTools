import type { CourseRecord } from "./courseData";
import type { PlanCourse } from "./planGenerator";

/**
 * timetableExport —— 课表清单导出（.txt）。
 *
 * 内容与格式忠实移植自 js/CourseArrangement.js 的 exportTimetable()：
 * - 数据源 = 当前课表网格显示的课程（激活方案课程 ∪ 班级课表调用组固定占用），
 *   按 poolKey 去重（对应原站 getActiveCoursesForDisplay 的 Map 语义）；
 * - 每门课程输出：标题 + 编号/课序号/通知单号/教师/班级/时间/地点/周次/
 *   校区/课程性质/学分；末尾汇总总学分；
 * - 导出文件名为「课表清单_YYYY-MM-DD_HH-mm.txt」（Blob + a[download] 下载）。
 */

export interface ExportSummary {
  count: number;
  credit: number;
  fileName: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 与原站 formatNowForFilename 一致：2026-09-01_14-05 */
export function formatNowForFilename(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

function parseCredit(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** 与原站 getCourseKey 五元组一致（toPoolOption.poolKey 即由此生成） */
function recordKey(record: CourseRecord): string {
  return [
    String(record["通知单号"] ?? ""),
    String(record["课程编号"] ?? ""),
    String(record["课序号"] ?? ""),
    String(record["课程名称"] ?? ""),
    String(record["上课时间"] ?? ""),
  ].join("|");
}

/**
 * 由当前显示课程生成课表清单内容。
 * @returns 无课程可导出时返回 null（对应原站 toast「当前课表没有课程，无需导出」）。
 */
export function buildTimetableTxt(
  records: CourseRecord[],
  displayCourses: PlanCourse[]
): { content: string; summary: ExportSummary } | null {
  // 教学班键 → 原始课程记录（供通知单号/课程性质/学分等字段回填）
  const recordByKey = new Map<string, CourseRecord>();
  records.forEach((record) => {
    const key = recordKey(record);
    if (!recordByKey.has(key)) recordByKey.set(key, record);
  });

  // 按 poolKey 去重（与原站 Map 语义一致）
  const seen = new Set<string>();
  const uniqueCourses: PlanCourse[] = [];
  displayCourses.forEach((course) => {
    if (seen.has(course.poolKey)) return;
    seen.add(course.poolKey);
    uniqueCourses.push(course);
  });

  if (!uniqueCourses.length) return null;

  let totalCredit = 0;
  const lines: string[] = [];
  lines.push("课表课程清单");
  lines.push(`导出时间：${formatNowForFilename().replace("_", " ")}`);
  lines.push(`课程总数：${uniqueCourses.length} 门`);
  lines.push("");

  uniqueCourses.forEach((course, index) => {
    const record = recordByKey.get(course.poolKey);
    totalCredit += parseCredit(record?.["学分"]);
    lines.push(`【${index + 1}】${course.title || "未命名课程"}`);
    lines.push(`    课程编号：${course.courseCode || "-"}`);
    lines.push(`    课序号：${course.option.课序号 || "-"}`);
    lines.push(`    通知单号：${record?.["通知单号"] || "-"}`);
    lines.push(`    授课教师：${course.option.teacher || "-"}`);
    lines.push(`    上课班级：${course.option.classText || "-"}`);
    lines.push(`    上课时间：${course.option.timeText || "-"}`);
    lines.push(`    上课地点：${course.option.locationText || "-"}`);
    lines.push(`    上课周次：${course.option.weekText || "-"}`);
    lines.push(`    校区：${course.option.campus || "-"}`);
    lines.push(`    课程性质：${record?.["课程性质"] || "-"}`);
    lines.push(`    学分：${record?.["学分"] ?? "-"}`);
    lines.push("");
  });

  lines.push(`总学分：${totalCredit.toFixed(1)}`);

  const fileName = `课表清单_${formatNowForFilename()}.txt`;
  return { content: lines.join("\n"), summary: { count: uniqueCourses.length, credit: totalCredit, fileName } };
}

/**
 * 生成并触发下载。
 * @returns 成功导出的汇总；课表无课程时返回 null（调用方负责提示）。
 */
export function downloadTimetableTxt(
  records: CourseRecord[],
  displayCourses: PlanCourse[]
): ExportSummary | null {
  const result = buildTimetableTxt(records, displayCourses);
  if (!result) return null;

  const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.summary.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return result.summary;
}
