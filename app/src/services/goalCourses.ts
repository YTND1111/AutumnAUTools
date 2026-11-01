/**
 * 目标 GPA 规划的待修课程合并（去重）。
 *
 * 课程来源有三处：手动/粘贴录入、从排课表导入、导入课表 txt。
 * 三处共用同一套去重口径，避免各自实现出现不一致：
 * - 课程编号优先（同一门课的不同教学班只算一门）；
 * - 无编号时退化为课程名（去空白 + 小写）；
 * - 与清单里已有课程重复、或本次导入内部重复，都只保留第一条。
 */

export interface GoalCourseCandidate {
  name: string;
  credits: number;
  code?: string;
}

export interface GoalCourseMergeResult {
  accepted: GoalCourseCandidate[];
  /** 因重复（清单已有 / 本次导入重复 / 无标识）被跳过的门数 */
  duplicates: number;
}

/** 课程名归一化：去空白、忽略大小写，用于无课程编号时的判重 */
export function normalizeGoalCourseName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

export function mergeGoalCourses(
  existing: { name: string; code?: string }[],
  incoming: GoalCourseCandidate[]
): GoalCourseMergeResult {
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  for (const course of existing) {
    const code = course.code?.trim();
    if (code) seenCodes.add(code);
    const name = normalizeGoalCourseName(course.name);
    if (name) seenNames.add(name);
  }

  const accepted: GoalCourseCandidate[] = [];
  let duplicates = 0;

  for (const course of incoming) {
    const code = course.code?.trim() ?? "";
    const name = normalizeGoalCourseName(course.name);
    if (!code && !name) {
      duplicates += 1;
      continue;
    }
    if ((code && seenCodes.has(code)) || (name && seenNames.has(name))) {
      duplicates += 1;
      continue;
    }
    if (code) seenCodes.add(code);
    if (name) seenNames.add(name);
    accepted.push({ ...course, code });
  }

  return { accepted, duplicates };
}
