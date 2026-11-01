/**
 * 绩点计算（纯函数，无副作用）。
 *
 * 口径说明（与官方规则对应）：
 * - 总 GPA：计入所有「计入」课程（排除通识课、EX/P/N）；
 * - 必修课 GPA：只计入课程类型为「必修」的课程；
 * - 同一门课程多次修读（课程号一致，无课程号时按课程名）按以下两种口径之一去重：
 *     · best  —— 成绩单口径：取最高一次成绩参与计算；
 *     · first —— 排名口径：取第一次修读成绩参与计算。
 *
 * 结果不在此处四舍五入，展示统一走 gpaRules.formatGpa（保留 2 位）。
 */

import { type CourseKind, type Grade, courseKindMeta, gradeCounts, gradeToPoint } from "./gpaRules";

/** 一条课程成绩记录（对应成绩单的一行） */
export interface GpaRecord {
  /** 本机生成的稳定 id（不参与计算） */
  id: string;
  /** 课程号：判断「同一门课重修」的唯一依据（可空，空时退化为按课程名判断） */
  code: string;
  name: string;
  credits: number;
  grade: Grade;
  kind: CourseKind;
  /** 是否参与计算（默认由课程类型与等级推导，用户可手动覆盖） */
  counted: boolean;
  /** 成绩单附注是否标注「重修」 */
  retake: boolean;
}

/** 重修去重口径 */
export type RetakeRule = "best" | "first";

export interface GpaRow {
  record: GpaRecord;
  /** 该课程绩点；null 表示 EX/P/N 无绩点 */
  point: number | null;
  /** 是否计入总 GPA */
  countedTotal: boolean;
  /** 是否计入必修课 GPA */
  countedRequired: boolean;
  /** 未计入的原因 / 去重说明（已计入时为空串） */
  note: string;
}

export interface GpaBucket {
  /** 平均学分绩点；无可计算课程时 null */
  gpa: number | null;
  /** 参与计算的学分合计 */
  credits: number;
  /** 参与计算的课程门数 */
  courses: number;
}

export interface GpaResult {
  rows: GpaRow[];
  total: GpaBucket;
  required: GpaBucket;
  /** 未计入总 GPA 的课程门数 */
  excluded: number;
}

/**
 * 课程去重键：优先课程号；无课程号时退化为课程名（去空白、忽略大小写与全半角括号）。
 * 官方以「课程编号」作为判断重修的唯一标准，无编号时名称是唯一可用的近似依据。
 */
export function courseKey(record: GpaRecord): string {
  const code = record.code.trim();
  if (code) return `code:${code}`;
  const name = record.name
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, "")
    .toLowerCase();
  return `name:${name}`;
}

/** 由课程类型与等级推导「是否默认计入」 */
export function deriveCounted(kind: CourseKind, grade: Grade): boolean {
  return courseKindMeta(kind).countsInTotal && gradeCounts(grade);
}

function emptyBucket(): GpaBucket {
  return { gpa: null, credits: 0, courses: 0 };
}

/** 汇总一个口径的 GPA */
function sumBucket(rows: GpaRow[], pick: (row: GpaRow) => boolean): GpaBucket {
  let credits = 0;
  let creditPoint = 0;
  let courses = 0;
  for (const row of rows) {
    if (!pick(row)) continue;
    const point = row.point;
    if (point === null) continue;
    credits += row.record.credits;
    creditPoint += point * row.record.credits;
    courses += 1;
  }
  return {
    gpa: credits > 0 ? creditPoint / credits : null,
    credits: Math.round(credits * 100) / 100,
    courses,
  };
}

/**
 * 计算 GPA（同时给出总 GPA 与必修课 GPA）。
 * @param records 成绩记录（顺序即录入顺序，「首次修读」口径依赖此顺序）
 * @param retakeRule 同一门课程多次修读时的取用口径
 */
export function computeGpa(records: GpaRecord[], retakeRule: RetakeRule): GpaResult {
  // 1. 按去重键分组，找出每组中被采用的记录下标
  const groups = new Map<string, number[]>();
  records.forEach((record, index) => {
    const key = courseKey(record);
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  });

  const rejected = new Map<number, string>(); // 下标 → 被排除原因（同一课程多次修读时未采用的那条）

  for (const indexes of groups.values()) {
    if (indexes.length <= 1) continue;
    const ruleText =
      retakeRule === "best"
        ? "同一课程多次修读：按成绩单口径取最高成绩参与计算"
        : "同一课程多次修读：按排名口径取首次修读成绩参与计算";

    // 默认取首次修读；「取最高」口径下再挑绩点最高的一条（同分仍取先录入者）
    let winner = indexes[0];
    if (retakeRule === "best") {
      let bestPoint = gradeToPoint(records[winner].grade) ?? -1;
      for (const index of indexes.slice(1)) {
        const point = gradeToPoint(records[index].grade) ?? -1;
        if (point > bestPoint) {
          bestPoint = point;
          winner = index;
        }
      }
    }
    for (const index of indexes) {
      if (index !== winner) rejected.set(index, `${ruleText}（本次未采用）`);
    }
  }

  // 2. 逐行给出计入结论
  const rows: GpaRow[] = records.map((record, index) => {
    const point = gradeToPoint(record.grade);
    const kind = courseKindMeta(record.kind);
    const rejectedReason = rejected.get(index);

    let note = "";
    if (rejectedReason) note = rejectedReason;
    else if (!record.counted) note = "已手动设为「不计入」";
    else if (point === null) note = "EX / P / N 不计入 GPA";
    else if (!kind.countsInTotal) note = `${kind.label}课不参与 GPA 计算`;

    const countedTotal = note === "";
    const countedRequired = countedTotal && kind.countsInRequired;

    return { record, point, countedTotal, countedRequired, note };
  });

  // 3. 汇总
  const total = sumBucket(rows, (row) => row.countedTotal);
  const required = sumBucket(rows, (row) => row.countedRequired);
  const excluded = rows.filter((row) => !row.countedTotal).length;

  return { rows, total: total.courses > 0 ? total : emptyBucket(), required, excluded };
}
