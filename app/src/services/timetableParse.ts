/**
 * 课表清单 txt 解析（排课表页「导出当前课表 (.txt)」产物的反向解析）。
 *
 * 导出的格式（见 services/timetableExport.ts）：
 *   课表课程清单
 *   导出时间：…
 *   课程总数：N 门
 *
 *   【1】高等数学（上）
 *       课程编号：01131565
 *       …
 *       学分：5
 *   …
 *   总学分：X
 *
 * 解析策略：以「【n】课程名」分块，块内识别「课程编号」「学分」两行；
 * 缺少有效学分的块计入 skipped（目标 GPA 规划必须有学分才能计算）。
 * 若文本里完全没有「【n】」标记，退化为逐行解析「课程名 … 学分」，
 * 便于用户直接粘贴自己整理的清单。
 */

export interface TimetableCourse {
  name: string;
  credits: number;
  code: string;
}

export interface TimetableParseResult {
  courses: TimetableCourse[];
  /** 无法采用的块/行及原因 */
  skipped: { raw: string; reason: string }[];
  /** 同课程编号重复出现的门数（只保留第一条） */
  duplicates: number;
}

const BLOCK_HEAD = /^【\s*\d+\s*】\s*(.+)$/;
const CODE_LINE = /^课程编号\s*[:：]\s*(.*)$/;
const CREDIT_LINE = /^学分\s*[:：]\s*([0-9]+(?:\.[0-9]+)?)/;

function toCredits(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 30) return 0;
  return Math.round(value * 10) / 10;
}

export function parseTimetableTxt(text: string): TimetableParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const skipped: TimetableParseResult["skipped"] = [];
  const parsed: TimetableCourse[] = [];

  let current: { name: string; code: string; credits: number } | null = null;
  const flush = () => {
    if (!current) return;
    const { name, code, credits } = current;
    current = null;
    if (!name.trim()) {
      skipped.push({ raw: code || "（未命名课程）", reason: "缺少课程名" });
      return;
    }
    if (credits <= 0) {
      skipped.push({ raw: name, reason: "缺少有效学分" });
      return;
    }
    parsed.push({ name: name.trim(), credits, code: code.trim() });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const head = trimmed.match(BLOCK_HEAD);
    if (head) {
      flush();
      current = { name: head[1].trim(), code: "", credits: 0 };
      continue;
    }
    if (current) {
      const code = trimmed.match(CODE_LINE);
      if (code) {
        current.code = code[1].trim();
        continue;
      }
      const credit = trimmed.match(CREDIT_LINE);
      if (credit) {
        current.credits = toCredits(Number(credit[1]));
        continue;
      }
    }
  }
  flush();

  // 没有分块标记时退化为逐行「课程名 … 学分」
  if (!parsed.length && !skipped.length) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const tokens = trimmed.split(/[\t,，\s]+/).filter(Boolean);
      const creditToken = [...tokens].reverse().find((token) => /^[0-9]+(?:\.[0-9]+)?$/.test(token));
      const credits = creditToken ? toCredits(Number(creditToken)) : 0;
      const name = tokens.filter((token) => token !== creditToken).join(" ").trim();
      if (!name || credits <= 0) {
        skipped.push({ raw: trimmed.slice(0, 60), reason: name ? "缺少有效学分" : "缺少课程名" });
        continue;
      }
      parsed.push({ name, credits, code: "" });
    }
  }

  // 同课程编号去重（同一门课的多个教学班只算一门）
  const seenCodes = new Set<string>();
  const courses: TimetableCourse[] = [];
  let duplicates = 0;
  for (const course of parsed) {
    if (course.code) {
      if (seenCodes.has(course.code)) {
        duplicates += 1;
        continue;
      }
      seenCodes.add(course.code);
    }
    courses.push(course);
  }

  return { courses, skipped, duplicates };
}
