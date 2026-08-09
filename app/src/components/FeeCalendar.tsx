import { useEffect, useState } from "react";

/**
 * FeeCalendar —— 窝囊费打表日历（原 index.html 内联脚本的 React 重写）。
 *
 * 与原实现的对应关系：
 * - 年月状态 feeCalState → useState，渲染由状态驱动（原实现为手动 innerHTML 重绘）；
 * - data/fee-days.json 高亮日期 → useEffect 内 fetch 一次，失败时按无高亮渲染（同原逻辑）；
 * - 上/下月切换 → setState（跨年进位逻辑与原脚本一致）。
 */

/** 把日期拼成与 JSON 一致的 'YYYY-MM-DD' 格式 */
function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export default function FeeCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // month 从 0 起
  const [highlightDays, setHighlightDays] = useState<ReadonlySet<string>>(new Set());

  // 读取高亮日期；失败时日历照常渲染，仅无高亮
  useEffect(() => {
    let cancelled = false;
    fetch("/data/fee-days.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((days: unknown) => {
        if (!cancelled && Array.isArray(days)) {
          setHighlightDays(new Set(days as string[]));
        }
      })
      .catch((err) => {
        console.warn("窝囊费打表：读取 data/fee-days.json 失败，按无高亮渲染。", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gotoPrevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const gotoNextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // 周一起始的偏移量与当月天数
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="fee-cal">
      <div className="fee-cal-header">
        <button type="button" className="fee-cal-nav" onClick={gotoPrevMonth} aria-label="上一月">
          ‹
        </button>
        <span className="fee-cal-title">
          {year}年{month + 1}月
        </span>
        <button type="button" className="fee-cal-nav" onClick={gotoNextMonth} aria-label="下一月">
          ›
        </button>
      </div>
      <div className="fee-cal-week">
        {WEEK_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="fee-cal-grid">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const highlighted = highlightDays.has(formatDate(year, month, day));
          return (
            <span key={day} className={highlighted ? "fee-day-highlight" : ""}>
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
