/**
 * 成绩文本解析（粘贴导入）。
 *
 * 用途：把从教务系统网页、电子成绩单 PDF 中复制出来的成绩文本，按行解析成课程记录。
 * 这是「PDF 文件解析」的无依赖替代方案：PDF 无法稳定解析版式，但选中文字复制后的
 * 逐行文本是可靠的，且用户可先看一眼再导入。
 *
 * 兼容的行格式（按列冗余度从高到低）：
 *   1. 成绩单 / 教务系统表格行：课程号  课程名  学分  成绩  绩点  [附注]
 *      例：202620271001357  高等数学（上）  5.0  A  4.0
 *   2. Excel 粘贴（制表符分隔）：同上，列可能更多（如含课程性质、学分绩点）
 *   3. 极简行：课程名  学分  成绩
 *      例：大学物理  3  85
 *   4. 五级制：优秀 / 良好 / 中等 / 及格 / 不及格（按 A/B/C/D/F 试算）
 *   5. 二级制：通过 / 不通过 / 免修（对应 P / N / EX，不计入 GPA）
 *
 * 解析策略（启发式，宁可跳过也不猜错）：
 * - 先找「成绩」列：字母等级优先，其次五级制/二级制词，最后才是 0–100 的整数百分比；
 * - 成绩之后的纯数字（≤5，多为绩点列）忽略；
 * - 成绩之前从右往左找「学分」：0.5–20 的数值，且不是课程号；
 * - 课程名 = 去掉课程号与学分后的文本；无法确定学分或成绩的行整行跳过并给出原因。
 */

import type { CourseKind } from "./gpaRules";
import {
  FIVE_LEVEL_TO_GRADE,
  percentToGrade,
  type Grade,
  kindFromNote,
} from "./gpaRules";

export interface ParsedCourse {
  code: string;
  name: string;
  credits: number;
  grade: Grade;
  kind: CourseKind;
  retake: boolean;
  /** 原始行文本（供导入预览/排查） */
  raw: string;
}

export interface SkippedLine {
  raw: string;
  reason: string;
}

export interface ParseResult {
  courses: ParsedCourse[];
  skipped: SkippedLine[];
}

const LETTER_GRADE = /^(A\+|A-|A|B\+|B-|B|C\+|C|D\+|D|F)$/i;
const TWO_LEVEL: Record<string, Grade> = {
  通过: "P",
  不通过: "N",
  免修: "EX",
  inv: "inv",
  INV: "inv",
};
/** 附注列常见取值（不是成绩） */
const NOTE_TOKENS = /^(重修|补考|首修|正常|—|-|--|---|—+)$/;
/** 表头行特征：同时出现两个以上列名才算表头（避免课程名里带「成绩」等词被误判成表头） */
const HEADER_KEYWORDS = [/课程号/, /课程名称|课程名/, /学分/, /成绩/, /绩点/, /附注/];

function looksLikeHeader(line: string): boolean {
  return HEADER_KEYWORDS.filter((re) => re.test(line)).length >= 2;
}

function normalizeGrade(raw: string): Grade | null {
  const token = raw.trim();
  if (!token) return null;
  if (LETTER_GRADE.test(token)) {
    // 统一大写（A+ / A- 等），避免 a+ 之类的输入
    return token.toUpperCase() as Grade;
  }
  if (FIVE_LEVEL_TO_GRADE[token]) return FIVE_LEVEL_TO_GRADE[token];
  if (TWO_LEVEL[token]) return TWO_LEVEL[token];
  return null;
}

function isNumberToken(token: string): boolean {
  return /^\d+(\.\d+)?$/.test(token);
}

/** 课程号：连续 5 位以上数字，或 2–6 位字母 + 4 位以上数字（如 01131565、S2025...） */
function looksLikeCode(token: string): boolean {
  if (/^\d{5,}$/.test(token)) return true;
  if (/^[A-Za-z]{1,6}\d{4,}$/.test(token)) return true;
  return false;
}

/** 拆分一行的列：制表符/竖线优先，其次空白 */
function splitColumns(line: string): string[] {
  const byTab = line.split(/[\t|]+/).map((part) => part.trim()).filter(Boolean);
  if (byTab.length > 1) return byTab;
  return line.split(/\s+/).filter(Boolean);
}

function parseLine(line: string): ParsedCourse | { reason: string } {
  const raw = line.trim();
  if (!raw) return { reason: "空行" };

  const columns = splitColumns(raw);
  if (columns.length < 2) return { reason: "列数不足（至少需要「课程名 + 学分 + 成绩」）" };

  // 1. 去掉行尾附注标记（重修/补考等），单独记录是否重修
  let retake = false;
  let noteText = "";
  while (columns.length > 2 && NOTE_TOKENS.test(columns[columns.length - 1])) {
    const tail = columns.pop() as string;
    noteText += tail;
    if (tail === "重修") retake = true;
  }

  // 2. 找成绩列：字母等级 > 五级制/二级制词 > 0–100 整数百分比
  let gradeIndex = -1;
  let grade: Grade | null = null;
  for (let i = columns.length - 1; i >= 0; i -= 1) {
    const normalized = normalizeGrade(columns[i]);
    if (normalized) {
      gradeIndex = i;
      grade = normalized;
      break;
    }
  }

  let percentApprox = false;
  if (gradeIndex === -1) {
    for (let i = columns.length - 1; i >= 0; i -= 1) {
      const token = columns[i];
      if (!/^\d{2,3}$/.test(token)) continue; // 百分比视为整数；带小数的是绩点列
      const value = Number(token);
      if (value < 0 || value > 100) continue;
      gradeIndex = i;
      grade = percentToGrade(value);
      percentApprox = true;
      break;
    }
  }

  if (!grade || gradeIndex === -1) return { reason: "未识别到成绩（支持 A+…F、通过/不通过、免修、百分制分数）" };

  // 3. 成绩之前从右往左找学分：0.5–20 的数值，且不是课程号
  let creditIndex = -1;
  for (let i = gradeIndex - 1; i >= 0; i -= 1) {
    const token = columns[i];
    if (!isNumberToken(token) || looksLikeCode(token)) continue;
    const value = Number(token);
    if (value < 0.5 || value > 20) continue;
    creditIndex = i;
    break;
  }
  if (creditIndex === -1) return { reason: "未识别到学分（需要 0.5–20 之间的数值）" };

  // 4. 课程号：学分之前最后一个像课程号的列
  let code = "";
  let nameStart = 0;
  for (let i = 0; i < creditIndex; i += 1) {
    if (looksLikeCode(columns[i])) {
      code = columns[i];
      nameStart = i + 1;
    }
  }

  // 5. 课程名 = 课程号与学分之间的文本；顺带识别课程性质关键词
  const name = columns.slice(nameStart, creditIndex).join(" ").replace(/\s+/g, " ").trim();
  if (!name) return { reason: "未识别到课程名" };

  const kindToken = columns.find((token) => /必修|选修|限选|任选|通识|公选/.test(token)) ?? "";
  const kind = kindFromNote(kindToken) ?? kindFromNote(noteText) ?? "other";

  const credits = Number(columns[creditIndex]);

  return {
    code,
    name,
    credits,
    grade,
    kind,
    retake: retake || /重修/.test(noteText),
    raw: percentApprox ? `${raw}  ↦ 按百分制换算为 ${grade}` : raw,
  };
}

/** 解析粘贴文本，返回课程列表与被跳过的行及原因 */
export function parseTranscriptText(text: string): ParseResult {
  const courses: ParsedCourse[] = [];
  const skipped: SkippedLine[] = [];

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    const parsed = parseLine(raw);
    if ("reason" in parsed) {
      // 表头行不必逐条报「未识别到成绩」，单独归类便于用户理解
      const reason = looksLikeHeader(raw) ? "表头行（已忽略）" : parsed.reason;
      skipped.push({ raw, reason });
      continue;
    }
    courses.push(parsed);
  }

  return { courses, skipped };
}
