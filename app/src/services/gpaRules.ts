/**
 * 绩点规则（中国农业大学）。
 *
 * 依据：中农大教字〔2022〕5号《中国农业大学全日制普通本科学生学籍管理规定》
 * 第十五条「考核成绩评定」（本科生院《成绩记载、查询与复核全规则解读》原文引用）：
 *   - 课程采用等级制或二级制（通过/不通过）记载成绩，必修课原则上采用等级制；
 *   - 课程学分绩点 = 课程绩点 × 课程学分数；
 *   - 平均学分绩点 GPA = ∑课程学分绩点 / ∑课程学分；
 *   - 普通通识课、核心通识课与记载为 EX/P/N 的课程不纳入 GPA 计算；
 *   - 学校以「必修课 GPA」和「总 GPA」两种方式评定学业表现；
 *   - 成绩单最终 GPA 四舍五入保留 2 位小数。
 *
 * 另据《成绩单显示与绩点计算规则》：同一门课程（课程编号一致）多次修读时，
 * 「成绩单 GPA」取最高一次成绩参与计算，「排名 GPA」取第一次修读成绩，两者规则不同。
 * 学校成绩单只显示等级、无百分制平均分，故本工具以等级为主输入，百分制仅作辅助换算。
 */

/** 等级制成绩（含二级制 P/N、免修 EX、无效 inv） */
export type Grade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "D+"
  | "D"
  | "F"
  | "EX"
  | "P"
  | "N"
  | "inv";

export interface GradeMeta {
  grade: Grade;
  /** 对应的百分制区间（成绩单只显示等级，此处用于说明与辅助换算） */
  range: string;
  /** 绩点；null 表示该成绩不参与 GPA 计算 */
  point: number | null;
  /** 是否参与 GPA 计算（仅等级本身的属性，课程类型另判） */
  counted: boolean;
  /** 一句话说明 */
  note?: string;
}

/** 官方等级 ↔ 绩点对照表（顺序即下拉选项顺序） */
export const GRADE_TABLE: GradeMeta[] = [
  { grade: "A+", range: "95–100", point: 4.0, counted: true },
  { grade: "A", range: "90–94", point: 4.0, counted: true },
  { grade: "A-", range: "85–89", point: 3.7, counted: true },
  { grade: "B+", range: "82–84", point: 3.3, counted: true },
  { grade: "B", range: "78–81", point: 3.0, counted: true },
  { grade: "B-", range: "75–77", point: 2.7, counted: true },
  { grade: "C+", range: "72–74", point: 2.3, counted: true },
  { grade: "C", range: "68–71", point: 2.0, counted: true },
  { grade: "D+", range: "64–67", point: 1.5, counted: true },
  { grade: "D", range: "60–63", point: 1.0, counted: true },
  { grade: "F", range: "0–59", point: 0, counted: true },
  { grade: "EX", range: "免修", point: null, counted: false, note: "免修不计入 GPA" },
  { grade: "P", range: "通过", point: null, counted: false, note: "二级制通过不计入 GPA" },
  { grade: "N", range: "不通过", point: null, counted: false, note: "二级制不通过不计入 GPA" },
  { grade: "inv", range: "无效", point: 0, counted: true, note: "作弊/违纪记 inv，按 0 绩点计入" },
];

const GRADE_MAP = new Map<Grade, GradeMeta>(GRADE_TABLE.map((item) => [item.grade, item]));

/** 取等级对应绩点；EX/P/N 返回 null（不计入） */
export function gradeToPoint(grade: Grade): number | null {
  const meta = GRADE_MAP.get(grade);
  return meta ? meta.point : null;
}

/** 等级元信息（未知等级返回 undefined） */
export function gradeMeta(grade: Grade): GradeMeta | undefined {
  return GRADE_MAP.get(grade);
}

/** 等级是否参与计算（EX/P/N 为 false） */
export function gradeCounts(grade: Grade): boolean {
  return GRADE_MAP.get(grade)?.counted ?? false;
}

/**
 * 百分制 → 等级（官方区间左闭右开，A+ 为 [95,100]）。
 * 仅在用户直接输入分数时用于换算，结果与教务系统等级一致。
 */
export function percentToGrade(score: number): Grade {
  if (!Number.isFinite(score) || score < 0 || score > 100) return "F";
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 82) return "B+";
  if (score >= 78) return "B";
  if (score >= 75) return "B-";
  if (score >= 72) return "C+";
  if (score >= 68) return "C";
  if (score >= 64) return "D+";
  if (score >= 60) return "D";
  return "F";
}

/**
 * 五级制（优秀/良好/中等/及格/不及格）→ 等级。
 * 农大主修成绩单使用等级制字母，此处仅供部分学院/旧成绩单粘贴时试算。
 */
export const FIVE_LEVEL_TO_GRADE: Record<string, Grade> = {
  优秀: "A",
  良好: "B",
  中等: "C",
  及格: "D",
  不及格: "F",
};

/** 课程类型：决定是否计入总 GPA / 必修课 GPA */
export type CourseKind = "required" | "elective" | "general" | "other";

export interface CourseKindMeta {
  value: CourseKind;
  label: string;
  /** 是否默认计入总 GPA（通识课不计入） */
  countsInTotal: boolean;
  /** 是否计入「必修课 GPA」 */
  countsInRequired: boolean;
  note: string;
}

export const COURSE_KINDS: CourseKindMeta[] = [
  {
    value: "required",
    label: "必修",
    countsInTotal: true,
    countsInRequired: true,
    note: "计入总 GPA 与必修课 GPA",
  },
  {
    value: "elective",
    label: "选修",
    countsInTotal: true,
    countsInRequired: false,
    note: "计入总 GPA，不计入必修课 GPA",
  },
  {
    value: "general",
    label: "通识",
    countsInTotal: false,
    countsInRequired: false,
    note: "普通/核心通识课不参与 GPA 计算（官方规则）",
  },
  {
    value: "other",
    label: "未分类",
    countsInTotal: true,
    countsInRequired: false,
    note: "计入总 GPA；确认为必修课后请改为「必修」",
  },
];

const COURSE_KIND_MAP = new Map<CourseKind, CourseKindMeta>(COURSE_KINDS.map((item) => [item.value, item]));

export function courseKindMeta(kind: CourseKind): CourseKindMeta {
  return COURSE_KIND_MAP.get(kind) ?? COURSE_KINDS[3];
}

/** 成绩单「附注」列 → 课程类型（能识别时给出初值，识别不出为 other） */
export function kindFromNote(text: string): CourseKind | null {
  if (/通识|公选|核心通/.test(text)) return "general";
  if (/必修/.test(text)) return "required";
  if (/选修|限选|任选/.test(text)) return "elective";
  return null;
}

/** 绩点展示：四舍五入保留 2 位（GPA 为 null 表示无可计算课程） */
export function formatGpa(value: number | null): string {
  if (value === null) return "—";
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** 学分展示：去掉多余的 .0（5 → "5"，5.5 → "5.5"） */
export function formatCredit(credits: number): string {
  return Number.isInteger(credits) ? String(credits) : String(Math.round(credits * 10) / 10);
}
