import type { GpaBucket, GpaResult, RetakeRule } from "./gpaCalc";
import { courseKindMeta, formatCredit, formatGpa } from "./gpaRules";
import { formatNowForFilename } from "./timetableExport";

/**
 * gpaExport —— 绩点明细导出（.txt）。
 *
 * 格式与 services/timetableExport.ts 的导出保持同一风格：标题 + 逐条明细 + 末尾汇总，
 * 文件名「绩点清单_YYYY-MM-DD_HH-mm.txt」，Blob + a[download] 触发下载。
 */

export interface GpaExportSummary {
  fileName: string;
  count: number;
  gpa: string;
}

function bucketLines(title: string, bucket: GpaBucket): string[] {
  return [
    `${title}：${formatGpa(bucket.gpa)}（计入 ${bucket.courses} 门，学分合计 ${formatCredit(bucket.credits)}）`,
  ];
}

export function buildGpaTxt(params: {
  termName: string;
  result: GpaResult;
  retakeRule: RetakeRule;
}): { content: string; summary: GpaExportSummary } {
  const { termName, result, retakeRule } = params;
  const lines: string[] = [];

  lines.push("成绩与绩点清单");
  lines.push(`导出时间：${formatNowForFilename().replace("_", " ")}`);
  lines.push(`学期：${termName}`);
  lines.push(`重修口径：${retakeRule === "best" ? "成绩单口径（取最高成绩）" : "排名口径（取首次修读）"}`);
  lines.push("");

  result.rows.forEach((row, index) => {
    const { record } = row;
    lines.push(`【${index + 1}】${record.name}`);
    if (record.code) lines.push(`    课程号：${record.code}`);
    lines.push(`    学分：${formatCredit(record.credits)}`);
    lines.push(`    等级：${record.grade}${row.point === null ? "（不计入 GPA）" : `（绩点 ${row.point.toFixed(1)}）`}`);
    lines.push(`    类型：${courseKindMeta(record.kind).label}`);
    lines.push(`    计入：${row.countedTotal ? "是" : "否"}${row.note ? ` —— ${row.note}` : ""}`);
    lines.push("");
  });

  lines.push(`课程总数：${result.rows.length} 门（计入 ${result.rows.length - result.excluded} 门）`);
  lines.push(...bucketLines("总 GPA", result.total));
  lines.push(...bucketLines("必修课 GPA", result.required));
  lines.push("");
  lines.push("计算依据：中国农业大学《全日制普通本科学生学籍管理规定》（中农大教字〔2022〕5号）第十五条。");
  lines.push("说明：普通通识课、核心通识课与 EX/P/N 成绩不纳入 GPA；以教务系统成绩单为准。");

  const fileName = `绩点清单_${formatNowForFilename()}.txt`;
  return {
    content: lines.join("\n"),
    summary: { fileName, count: result.rows.length, gpa: formatGpa(result.total.gpa) },
  };
}

export function downloadGpaTxt(params: {
  termName: string;
  result: GpaResult;
  retakeRule: RetakeRule;
}): GpaExportSummary {
  const { content, summary } = buildGpaTxt(params);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = summary.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return summary;
}
