/**
 * 课程数据层：类型定义与纯检索函数。
 *
 * 检索逻辑忠实移植自 js/CourseArrangement.js：
 * - normalize / splitClasses 与原实现一致；
 * - findCourseCandidates：按「课程编号|课程名称」匹配并去重，标签为 编号-名称；
 * - findClassTimetableCandidates：按拆分后的班级名 + 原始班级串匹配。
 * 纯函数设计（数据作为参数传入），便于测试与未来接入后端检索接口。
 */

/** 课程通知单 JSON 记录（字段名为 Excel 表头原文） */
export interface CourseRecord {
  序号: number;
  通知单号: string;
  校区: string;
  开课学院: string;
  教师姓名: string;
  课程编号: string;
  课序号: string;
  课程名称: string;
  课程英文名称: string;
  上课班级: string;
  班级人数: string;
  限选人数: string;
  学分: string;
  总学时: string;
  课程性质: string;
  课程属性: string;
  上课周次: string;
  上课时间地点: string;
  上课时间: string;
  [key: string]: unknown;
}

export interface CourseCandidate {
  code: string;
  name: string;
  label: string;
}

export interface ClassCandidate {
  className: string;
  label: string;
}

/** 非真实班级的占位标签（如通识课对所有学生开放时的“临班”），不可作为班级课表调用目标 */
export const NON_CLASS_NAME = "临班";

/** 与原脚本一致：trim + 小写 */
export function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** 与原脚本一致：按 ，,、空白 / 拆分班级串 */
export function splitClasses(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[，,、\s/]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** 与原脚本一致：按 ，,、拆分教师串 */
export function splitTeachers(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[，,、]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** 课程检索：编号|名称 包含匹配，按 编号|名称 去重（对应原 findCourseCandidates） */
export function findCourseCandidates(courses: CourseRecord[], rawQuery: string): CourseCandidate[] {
  const query = normalize(rawQuery);
  const grouped = new Map<string, CourseCandidate>();

  courses.forEach((course) => {
    const code = String(course["课程编号"] ?? "").trim();
    const name = String(course["课程名称"] ?? "").trim();
    if (!code) return;
    if (!normalize(`${code}|${name}`).includes(query)) return;
    const key = `${code}|${name}`;
    if (!grouped.has(key)) {
      grouped.set(key, { code, name, label: `${code}-${name}` });
    }
  });

  return Array.from(grouped.values());
}

/** 班级检索：拆分班级名 + 原始班级串匹配（对应原 findClassTimetableCandidates） */
export function findClassTimetableCandidates(courses: CourseRecord[], rawQuery: string): ClassCandidate[] {
  const query = normalize(rawQuery);
  const classNames = new Set<string>();

  /** 仅收录真实班级名：过滤“临班”等非班级占位标签 */
  const isRealClassName = (name: string) => name !== NON_CLASS_NAME;

  courses.forEach((course) => {
    const raw = String(course["上课班级"] ?? "").trim();
    if (!raw) return;

    splitClasses(raw).forEach((className) => {
      if (isRealClassName(className) && normalize(className).includes(query)) {
        classNames.add(className);
      }
    });

    if (isRealClassName(raw) && normalize(raw).includes(query)) {
      classNames.add(raw);
    }
  });

  return Array.from(classNames).map((className) => ({ className, label: className }));
}
