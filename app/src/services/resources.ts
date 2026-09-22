/**
 * resources —— 学习资料页数据层。
 *
 * 纯静态方案：manifest.json（人工维护，课程分组 + 条目元数据）+
 * files.json（由 scripts/sync-resources.mjs 扫描 public/resources 自动生成，
 * 提供真实文件大小与存在性校验）。页面加载后把二者按 file 路径合并：
 * - 文件存在 → 展示真实大小（manifest 未填 size 时回退）；
 * - 文件缺失 → 行内标记“文件缺失”并禁用下载（防 404 链接）。
 */

/** manifest 条目：一份资料文件 */
export interface ResourceItem {
  id: string;
  name: string;
  description?: string;
  /** 展示型标签优先，其次按扩展名推断 */
  type?: string;
  /** 站点根相对路径，如 resources/高等数学/2024期末.pdf */
  file: string;
  /** 可选：人工填写的展示大小；缺省时用 files.json 的真实大小 */
  size?: string;
  /** 可选展示元信息，如年份/学分 */
  year?: string;
}

/** manifest 分组：按课程/学科组织 */
export interface ResourceGroup {
  id: string;
  name: string;
  description?: string;
  items: ResourceItem[];
}

/** manifest.json 整体结构 */
export interface ResourcesManifest {
  title?: string;
  /** 资料更新时间 YYYY-MM-DD */
  updatedAt?: string;
  /** 页面顶部提示文案 */
  notice?: string;
  groups: ResourceGroup[];
}

/** files.json 中的单个文件（脚本自动扫描生成） */
export interface ScannedFile {
  /** 站点根相对路径，与 manifest.file 同约定 */
  path: string;
  name: string;
  ext: string;
  size: number;
}

export interface FilesIndex {
  generatedAt?: string;
  files: ScannedFile[];
}

/** 合并后的一条资料（页面视图） */
export interface ResourceView extends ResourceItem {
  /** 真实大小文本（优先 files.json，其次 manifest.size） */
  sizeText: string | null;
  /** 文件在磁盘上是否存在 */
  exists: boolean;
  /** 是否可在浏览器内预览（当前仅 pdf） */
  previewable: boolean;
  typeLabel: string;
  typeKey: string;
}

export const RESOURCES_MANIFEST_PATH = "/resources/manifest.json";
export const RESOURCES_FILES_PATH = "/resources/files.json";

/** 文件类型 → 徽标信息 */
const TYPE_META: Record<string, { label: string; key: string }> = {
  pdf: { label: "PDF", key: "pdf" },
  txt: { label: "TXT", key: "txt" },
  doc: { label: "WORD", key: "doc" },
  docx: { label: "WORD", key: "doc" },
  xls: { label: "EXCEL", key: "xls" },
  xlsx: { label: "EXCEL", key: "xls" },
  ppt: { label: "PPT", key: "ppt" },
  pptx: { label: "PPT", key: "ppt" },
  zip: { label: "压缩包", key: "zip" },
  rar: { label: "压缩包", key: "zip" },
  "7z": { label: "压缩包", key: "zip" },
};

/** 由扩展名推断类型（如未登记显示「文件」） */
export function extType(ext: string): { label: string; key: string } {
  const meta = TYPE_META[ext.toLowerCase()];
  return meta ?? { label: "文件", key: "file" };
}

/** 扩展名（小写、含点，如 ".pdf"），无扩展名返回 "" */
export function extOf(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  if (idx <= 0) return "";
  return filePath.slice(idx + 1).toLowerCase();
}

/** 字节数 → 人类可读大小 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

/** 是否可在浏览器内预览（当前支持 pdf 原生渲染） */
export function isPreviewable(filePath: string): boolean {
  return extOf(filePath) === "pdf";
}

/** 加载 manifest（失败返回 null，由页面展示错误态） */
export async function fetchManifest(): Promise<ResourcesManifest | null> {
  try {
    const res = await fetch(RESOURCES_MANIFEST_PATH, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as ResourcesManifest;
  } catch {
    return null;
  }
}

/** 加载 files.json（可选增强：不存在/失败时返回 null，不影响基础列表） */
export async function fetchFilesIndex(): Promise<FilesIndex | null> {
  try {
    const res = await fetch(RESOURCES_FILES_PATH, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as FilesIndex;
  } catch {
    return null;
  }
}

/** 合并 manifest + files.json → 页面视图列表（扁平，含所属分组信息） */
export function buildResourceViews(
  manifest: ResourcesManifest | null,
  filesIndex: FilesIndex | null
): Array<{ group: ResourceGroup; view: ResourceView }> {
  const sizeMap = new Map<string, number>();
  filesIndex?.files.forEach((file) => sizeMap.set(file.path, file.size));

  const result: Array<{ group: ResourceGroup; view: ResourceView }> = [];
  manifest?.groups.forEach((group) => {
    group.items.forEach((item) => {
      const exists = sizeMap.has(item.file);
      const bytes = sizeMap.get(item.file);
      const ext = extOf(item.file);
      // 展示类型：优先 manifest.type 字段（人工语义），否则按文件名扩展名推断
      const declared = item.type?.trim();
      const meta = declared ? (TYPE_META[declared.toLowerCase()] ?? extType(ext)) : extType(ext);
      const view: ResourceView = {
        ...item,
        sizeText: exists && bytes !== undefined ? formatBytes(bytes) : item.size?.trim() || null,
        exists,
        previewable: isPreviewable(item.file),
        typeLabel: meta.label,
        typeKey: meta.key,
      };
      result.push({ group, view });
    });
  });
  return result;
}
