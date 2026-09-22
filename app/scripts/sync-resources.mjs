#!/usr/bin/env node
/**
 * sync-resources —— 学习资料静态资源扫描校验脚本。
 *
 * 用法：node scripts/sync-resources.mjs [资源目录相对路径]
 *   （默认 public/resources，须在 app/ 目录下运行）
 *
 * 职责：
 * 1. 递归扫描资源目录（跳过 manifest.json / files.json / README.txt 与点文件），
 *    生成 files.json —— 前端据此展示真实文件大小并校验条目文件是否存在；
 * 2. 读取 manifest.json，交叉校验并报告两类问题：
 *    - manifest 引用了但磁盘上缺失的文件；
 *    - 磁盘上存在但 manifest 未登记的文件（提示可上架）。
 *
 * 退出码：0 = 完成（缺失引用仅告警）；脚本本身不修改 manifest。
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), process.argv[2] ?? "public/resources");
/** 条目/清单统一使用站点根相对路径（如 resources/demo/a.pdf），与 manifest.file 一致 */
const URL_PREFIX = path.basename(ROOT);
const SKIP_FILES = new Set(["manifest.json", "files.json", "README.txt", "README.md"]);

/** 递归收集目录内文件（站点根相对路径，正斜杠） */
function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name)) {
      const stat = fs.statSync(full);
      results.push({
        path: `${URL_PREFIX}/${path.relative(ROOT, full).split(path.sep).join("/")}`,
        name: entry.name,
        ext: path.extname(entry.name).slice(1).toLowerCase() || "file",
        size: stat.size,
      });
    }
  }
  return results;
}

if (!fs.existsSync(ROOT)) {
  console.error(`[sync-resources] 目录不存在：${ROOT}`);
  process.exit(1);
}

const files = walkFiles(ROOT).sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
const fileSet = new Set(files.map((f) => f.path));
const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

// 写 files.json
const filesJson = { generatedAt: new Date().toISOString(), files };
fs.writeFileSync(path.join(ROOT, "files.json"), JSON.stringify(filesJson, null, 2) + "\n", "utf8");

// 交叉校验 manifest
const manifestPath = path.join(ROOT, "manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : null;

const listedFiles = manifest?.groups?.flatMap((group) => group.items.map((item) => item.file)) ?? [];
const missing = listedFiles.filter((file) => !fileSet.has(file));
const orphan = files.filter((f) => !listedFiles.includes(f.path));

console.log(`[sync-resources] 资源目录：${ROOT}`);
console.log(`[sync-resources] 磁盘文件 ${files.length} 个，共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB → 已生成 files.json`);
if (manifest) {
  console.log(`[sync-resources] manifest 登记条目 ${listedFiles.length} 条（${manifest.groups.length} 个分组）`);
}
if (missing.length) {
  console.warn(`[sync-resources] 警告：manifest 引用了 ${missing.length} 个磁盘缺失的文件：`);
  missing.forEach((f) => console.warn(`    - ${f}`));
}
if (orphan.length) {
  console.log(`[sync-resources] 提示：磁盘有 ${orphan.length} 个文件未在 manifest 登记（如需上架请在 manifest 中登记）：`);
  orphan.forEach((f) => console.log(`    - ${f.path} (${f.size} B)`));
}
if (!missing.length && !orphan.length) {
  console.log("[sync-resources] 校验通过：manifest 与磁盘文件一一对应。");
}
