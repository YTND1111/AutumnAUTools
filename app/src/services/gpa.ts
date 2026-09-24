/** 绩点与目标计算：只在最终展示时四舍五入，不对中间学分积提前舍入。 */
export interface GpaCourse {
  id: string;
  name: string;
  code: string;
  credits: string;
  grade: string;
  score: string;
  included: boolean;
}

export type GradeMode = "points" | "percent";
export interface GradeBand { minimum: number; points: number }

/** 仅作可编辑示例，不代表学校的百分制换算标准。 */
export const EXAMPLE_BANDS = "0=0\n60=1\n64=1.5\n68=2\n72=2.3\n75=2.7\n78=3\n82=3.3\n85=3.7\n90=4";

export function readNumber(raw: string, min: number, max: number): number | null {
  const value = raw.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function parseBands(raw: string, scale: number): { bands: GradeBand[]; error: string } {
  const lines = raw.trim().split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length || lines.length > 30) return { bands: [], error: "请填写 1–30 行换算规则。" };
  const bands: GradeBand[] = [];
  for (const line of lines) {
    const parts = line.split("=");
    const minimum = parts.length === 2 ? readNumber(parts[0], 0, 100) : null;
    const points = parts.length === 2 ? readNumber(parts[1], 0, scale) : null;
    if (minimum === null || points === null) {
      return { bands: [], error: `每行使用“最低分=绩点”，分数为 0–100，绩点为 0–${scale}。` };
    }
    bands.push({ minimum, points });
  }
  bands.sort((a, b) => a.minimum - b.minimum);
  if (bands[0].minimum !== 0) return { bands: [], error: "请包含 0 分起始档，避免遗漏低分成绩。" };
  if (bands.some((band, i) => i > 0 && (band.minimum === bands[i - 1].minimum || band.points < bands[i - 1].points))) {
    return { bands: [], error: "最低分不能重复，绩点应随分数递增或保持不变。" };
  }
  return { bands, error: "" };
}

export function convertGrade(grade: number, mode: GradeMode, bands: GradeBand[]): number {
  if (mode === "points") return grade;
  return [...bands].reverse().find((band) => grade >= band.minimum)?.points ?? 0;
}

export interface EvaluatedCourse {
  course: GpaCourse;
  credits: number | null;
  points: number | null;
  status: "counted" | "excluded" | "incomplete" | "invalid" | "retake";
  message: string;
}

export function calculateGpa(courses: GpaCourse[], mode: GradeMode, scale: number, bands: GradeBand[]) {
  const rows: EvaluatedCourse[] = courses.map((course) => {
    const base = { course, credits: null, points: null };
    const rawGrade = mode === "points" ? course.grade : course.score;
    if (!course.included) return { ...base, status: "excluded", message: "不计入" };
    if (/^(P|N|EX)$/i.test(rawGrade.trim())) return { ...base, status: "excluded", message: "P / N / EX 不计入" };
    if (!course.credits.trim() || !rawGrade.trim()) return { ...base, status: "incomplete", message: "待填学分或成绩" };
    const credits = readNumber(course.credits, 0, 1000);
    const grade = readNumber(rawGrade, 0, mode === "points" ? scale : 100);
    if (credits === null || credits === 0) return { ...base, status: "invalid", message: "学分须大于 0，且不超过 1000" };
    if (grade === null) return { ...base, status: "invalid", message: `成绩须为 0–${mode === "points" ? scale : 100}` };
    if (mode === "percent" && !bands.length) return { ...base, status: "invalid", message: "请先修正换算规则" };
    return { course, credits, points: convertGrade(grade, mode, bands), status: "counted", message: "计入" };
  });

  // 非空课程编号相同才视为重修；名称相同不会自动合并。
  const groups = new Map<string, EvaluatedCourse[]>();
  for (const row of rows) {
    const code = row.course.code.trim();
    if (row.status !== "counted" || !code) continue;
    groups.set(code, [...(groups.get(code) ?? []), row]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (group.some((row) => row.credits !== group[0].credits)) {
      group.forEach((row) => { row.status = "invalid"; row.message = "同编号的学分不一致，请核对"; });
      continue;
    }
    const best = group.reduce((a, b) => b.points! > a.points! ? b : a);
    group.forEach((row) => {
      if (row !== best) { row.status = "retake"; row.message = "同编号已取最高绩点"; }
    });
  }
  const counted = rows.filter((row) => row.status === "counted");
  const credits = counted.reduce((sum, row) => sum + row.credits!, 0);
  const weightedPoints = counted.reduce((sum, row) => sum + row.credits! * row.points!, 0);
  return {
    rows, credits, weightedPoints, count: counted.length,
    gpa: credits ? weightedPoints / credits : null,
    invalidCount: rows.filter((row) => row.status === "invalid").length,
    incompleteCount: rows.filter((row) => row.status === "incomplete").length,
  };
}

/** 所需平均绩点是必要的加权目标，不反推成虚假的“平均百分制成绩”。 */
export function calculateGpaTarget(currentCredits: number, currentPoints: number, remainingCredits: number, target: number, maximum: number) {
  if (![currentCredits, currentPoints, remainingCredits, target, maximum].every(Number.isFinite) ||
    currentCredits < 0 || currentPoints < 0 || remainingCredits <= 0 || target < 0 || maximum < 0) return null;
  const totalCredits = currentCredits + remainingCredits;
  const required = (target * totalCredits - currentPoints) / remainingCredits;
  const highest = (currentPoints + remainingCredits * maximum) / totalCredits;
  return { required, highest, status: required > maximum + 1e-10 ? "impossible" : required <= 0 ? "secured" : "possible" } as const;
}

/** 平时分与期末分各按百分制输入；最终总评也为百分制。 */
export function calculateExamTarget(regularScore: number, examWeight: number, target: number) {
  if (![regularScore, examWeight, target].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) return null;
  const ratio = examWeight / 100;
  const base = regularScore * (1 - ratio);
  const highest = base + 100 * ratio;
  const required = ratio === 0 ? null : (target - base) / ratio;
  const status = target > highest + 1e-10 ? "impossible" : target <= base ? "secured" : "possible";
  return { required, highest, status } as const;
}

/** 目标值向上取到指定精度，避免普通四舍五入把所需成绩算低。 */
export function ceilTarget(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  return (Math.ceil(value * factor - 1e-9) / factor).toFixed(decimals);
}

/** 处理二进制浮点在 1.005 等十进制中点附近的偏差。 */
export function formatGpa(value: number): string {
  return (Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100).toFixed(2);
}
