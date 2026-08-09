import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SearchBar —— 通用搜索建议输入框（课程检索 / 班级检索共用）。
 *
 * 交互忠实移植自 js/CourseArrangement.js 的 filterCourseInput / filterClassInput：
 * - 输入即检索，建议上限 50 条；
 * - 空查询收起建议；数据未就绪时提示「加载中」；无匹配显示空提示；
 * - 选中建议后回填输入框并收起；清除按钮清空输入并收起；
 * - 点击搜索栏外区域收起建议（原实现为 document 级点击监听）。
 */

const SUGGESTION_LIMIT = 50;

export interface SearchBarProps<T> {
  placeholder: string;
  /** 清除按钮的无障碍标签 */
  clearAriaLabel: string;
  /** 数据是否就绪（未就绪时输入显示 loadingText） */
  dataReady?: boolean;
  loadingText?: string;
  /** 无匹配时的提示 */
  emptyText: string;
  /** 输入变化时执行检索（应返回全部匹配，组件内部截断到 50 条） */
  onQuery: (query: string) => T[];
  /** 取建议项显示标签 */
  getLabel: (candidate: T) => string;
  /** 选中建议项（组件已先行回填输入框并收起建议） */
  onPick: (candidate: T, label: string) => void;
}

export default function SearchBar<T>({
  placeholder,
  clearAriaLabel,
  dataReady = true,
  loadingText = "数据加载中，请稍候...",
  emptyText,
  onQuery,
  getLabel,
  onPick,
}: SearchBarProps<T>) {
  const [query, setQuery] = useState("");
  // items/message 二选一展示；两者皆 null 时收起建议框
  const [items, setItems] = useState<T[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    setItems(null);
    setMessage(null);
  }, []);

  // 点击搜索栏外区域时收起建议
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        hide();
      }
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [hide]);

  const handleInput = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      hide();
      return;
    }
    if (!dataReady) {
      setItems(null);
      setMessage(loadingText);
      return;
    }
    const found = onQuery(value).slice(0, SUGGESTION_LIMIT);
    if (!found.length) {
      setItems(null);
      setMessage(emptyText);
      return;
    }
    setMessage(null);
    setItems(found);
  };

  const handlePick = (candidate: T) => {
    const label = getLabel(candidate);
    setQuery(label);
    onPick(candidate, label);
    hide();
  };

  const handleClear = () => {
    setQuery("");
    hide();
  };

  const boxVisible = items !== null || message !== null;

  return (
    <div className="search-bar" ref={rootRef}>
      <div className="search-field has-clear">
        <input
          className="search-input"
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
        />
        <button
          className="input-clear-btn"
          type="button"
          aria-label={clearAriaLabel}
          onClick={handleClear}
        >
          x
        </button>
        {boxVisible && (
          <div className="suggestion-box">
            {message !== null ? (
              <p className="suggestion-empty">{message}</p>
            ) : (
              items!.map((candidate, index) => (
                <button
                  key={`${getLabel(candidate)}-${index}`}
                  type="button"
                  className="suggestion-item"
                  onClick={() => handlePick(candidate)}
                >
                  {getLabel(candidate)}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
