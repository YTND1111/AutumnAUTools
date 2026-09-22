import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FloatingChrome from "../components/FloatingChrome";
import type { ResourceView } from "../services/resources";
import {
  buildResourceViews,
  fetchFilesIndex,
  fetchManifest,
  type ResourcesManifest,
  type FilesIndex,
} from "../services/resources";
import "./ResourcesPage.css";

/**
 * ResourcesPage —— 学习资料下载页（/resources）。
 *
 * 纯静态资料站：
 * - 数据 = public/resources/manifest.json（人工维护，按课程/学科分组）
 *   + files.json（scripts/sync-resources.mjs 扫描自动生成：真实大小/存在性校验）；
 * - 功能：按课程分组浏览、全库搜索、类型徽标、文件大小、下载、PDF 在线预览、
 *   本机下载次数（localStorage 记录，键 autumn-res-dl:<id>）；
 * - 文件缺失时行内提示并禁用下载（防止 404 链接上架）。
 */

const SIDEBAR_LINKS = [
  { to: "/", label: "本站首页" },
  { to: "/ca", label: "排课表工具" },
  { to: "/qbn", label: "题库" },
  { to: "/resources", label: "学习资料" },
];

const DL_COUNT_KEY_PREFIX = "autumn-res-dl:";

function ItemRow({
  view,
  groupName,
  count,
  onDownload,
  onPreview,
}: {
  view: ResourceView;
  groupName: string;
  count: number;
  onDownload: (view: ResourceView) => void;
  onPreview: (view: ResourceView) => void;
}) {
  const metaParts: string[] = [];
  if (view.year) metaParts.push(view.year);
  if (view.sizeText) metaParts.push(view.sizeText);
  if (!view.exists) metaParts.push("⚠ 文件缺失");

  return (
    <li className={`res-item${view.exists ? "" : " is-missing"}`}>
      <span className={`res-type res-type-${view.typeKey}`}>{view.typeLabel}</span>

      <div className="res-item-main">
        <div className="res-item-name">{view.name}</div>
        {metaParts.length > 0 && <div className="res-item-meta">{metaParts.join(" · ")}</div>}
        {view.description && <div className="res-item-desc">{view.description}</div>}
        {count > 0 && <div className="res-item-count">本机已下载 {count} 次</div>}
      </div>

      <div className="res-item-actions">
        {view.exists ? (
          <>
            {view.previewable && (
              <button type="button" className="res-btn" onClick={() => onPreview(view)}>
                预览
              </button>
            )}
            <a
              className="res-btn is-primary"
              href={`/${view.file}`}
              download
              title={groupName ? `下载「${view.name}」` : undefined}
              onClick={() => onDownload(view)}
            >
              下载
            </a>
          </>
        ) : (
          <span className="res-missing-text">文件缺失</span>
        )}
      </div>
    </li>
  );
}

export default function ResourcesPage() {
  const [manifest, setManifest] = useState<ResourcesManifest | null>(null);
  const [filesIndex, setFilesIndex] = useState<FilesIndex | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<ResourceView | null>(null);

  useEffect(() => {
    document.title = "秋功-学习资料";
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchManifest(), fetchFilesIndex()]).then(([m, f]) => {
      if (!alive) return;
      setManifest(m);
      setFilesIndex(f);
      setLoadState(m ? "ready" : "error");
    });
    return () => {
      alive = false;
    };
  }, []);

  const entries = useMemo(() => buildResourceViews(manifest, filesIndex), [manifest, filesIndex]);

  // 读取本机下载次数
  const entryIds = useMemo(() => entries.map((entry) => entry.view.id).join("|"), [entries]);
  useEffect(() => {
    if (!entries.length) return;
    const next: Record<string, number> = {};
    entries.forEach(({ view }) => {
      try {
        const raw = localStorage.getItem(`${DL_COUNT_KEY_PREFIX}${view.id}`);
        if (raw) next[view.id] = Number(raw) || 0;
      } catch {
        /* 忽略 localStorage 不可用 */
      }
    });
    setCounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIds]);

  const totalFiles = entries.length;

  const trimmedQuery = query.trim().toLowerCase();
  const matchedEntries = useMemo(
    () =>
      trimmedQuery
        ? entries.filter(({ group, view }) =>
            [view.name, view.description ?? "", view.year ?? "", group.name]
              .join(" ")
              .toLowerCase()
              .includes(trimmedQuery)
          )
        : entries,
    [entries, trimmedQuery]
  );

  const toggleCollapsed = (groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleDownload = (view: ResourceView) => {
    setCounts((prev) => {
      const next = { ...prev, [view.id]: (prev[view.id] ?? 0) + 1 };
      try {
        localStorage.setItem(`${DL_COUNT_KEY_PREFIX}${view.id}`, String(next[view.id]));
      } catch {
        /* 忽略 localStorage 不可用 */
      }
      return next;
    });
  };

  // 预览弹层：Esc / 遮罩关闭
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [preview]);

  const groupsInOrder = manifest?.groups ?? [];

  return (
    <>
      <FloatingChrome links={SIDEBAR_LINKS} />

      <div className="resources-page">
        {/* 顶部导航栏 */}
        <div className="header primary-bg">
          <div className="container">
            <div className="logo">秋功-农大工具站</div>
            <div className="nav-list">
              <div className="nav-item">
                <Link to="/">首页</Link>
              </div>
              <div className="nav-item">
                <Link to="/qbn">题库</Link>
              </div>
              <div className="nav-item">
                <Link to="/resources">学习资料</Link>
              </div>
              <div className="nav-item">联系作者</div>
            </div>
          </div>
        </div>

        <main className="main container">
          <div className="res-panel">
            <div className="title-bar">
              <span className="title">学习资料下载</span>
              {manifest?.updatedAt && <span className="res-updated">资料更新于 {manifest.updatedAt}</span>}
            </div>

            {manifest?.notice && <p className="res-notice">{manifest.notice}</p>}

            {/* 搜索框 */}
            <div className="res-search">
              <input
                className="res-search-input"
                type="text"
                placeholder="搜索课程或资料名称，如：高等数学 / 期末 / 2024…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="搜索学习资料"
              />
              {query && (
                <button
                  type="button"
                  className="res-search-clear"
                  aria-label="清空搜索"
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              )}
            </div>

            {/* 状态区 */}
            {loadState === "loading" && <p className="res-empty">资料加载中…</p>}
            {loadState === "error" && (
              <p className="res-empty is-error">
                资料清单加载失败：请确认 public/resources/manifest.json 存在且格式正确。
              </p>
            )}

            {loadState === "ready" && (
              <>
                {matchedEntries.length === 0 ? (
                  <p className="res-empty">
                    {trimmedQuery ? `没有找到与「${query.trim()}」匹配的资料` : "暂无资料，整理中，敬请期待。"}
                  </p>
                ) : (
                  <div className="res-groups">
                    {groupsInOrder.map((group) => {
                      const items = matchedEntries.filter((entry) => entry.group.id === group.id);
                      if (items.length === 0) return null;
                      const isCollapsed = collapsed.has(group.id);
                      return (
                        <section className="res-group" key={group.id}>
                          <button
                            type="button"
                            className="res-group-head"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleCollapsed(group.id)}
                          >
                            <span className="res-group-name">{group.name}</span>
                            <span className="res-group-meta">
                              {items.length} 个文件{isCollapsed ? " · 已折叠" : ""}
                              <span className={`res-group-arrow${isCollapsed ? " is-collapsed" : ""}`}>▾</span>
                            </span>
                          </button>

                          {group.description && <p className="res-group-desc">{group.description}</p>}

                          {!isCollapsed && (
                            <ul className="res-list">
                              {items.map(({ view }) => (
                                <ItemRow
                                  key={view.id}
                                  view={view}
                                  groupName={group.name}
                                  count={counts[view.id] ?? 0}
                                  onDownload={handleDownload}
                                  onPreview={setPreview}
                                />
                              ))}
                            </ul>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}

                <p className="res-foot">
                  共 {totalFiles} 个资料文件{manifest?.updatedAt ? ` · 最近更新 ${manifest.updatedAt}` : ""} ·
                  资料仅供学习交流，请勿用于商业用途
                </p>
              </>
            )}
          </div>
        </main>

        {/* 页脚 */}
        <div className="footer primary-bg text-white text-center">
          <div className="container">
            <p>秋功</p>
          </div>
        </div>
      </div>

      {/* PDF 在线预览弹层 */}
      {preview && preview.exists && (
        <div className="res-modal" role="dialog" aria-modal="true" aria-label={`预览 ${preview.name}`} onClick={() => setPreview(null)}>
          <div className="res-modal-box" onClick={(event) => event.stopPropagation()}>
            <div className="res-modal-head">
              <span className="res-modal-title">{preview.name}</span>
              <div className="res-modal-actions">
                <a className="res-btn is-primary" href={`/${preview.file}`} download onClick={() => handleDownload(preview)}>
                  下载
                </a>
                <button type="button" className="res-btn" onClick={() => setPreview(null)}>
                  关闭
                </button>
              </div>
            </div>
            <iframe className="res-modal-frame" src={`/${preview.file}`} title={`预览 ${preview.name}`} />
          </div>
        </div>
      )}
    </>
  );
}
