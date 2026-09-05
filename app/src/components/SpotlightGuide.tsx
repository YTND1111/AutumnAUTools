import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * SpotlightGuide —— 交互式引导教程（spotlight 高亮 + 底部引导面板）。
 *
 * 特性：
 * - 每个步骤可指定一个页面元素（CSS 选择器）作为高亮目标：四周遮罩条只压暗
 *   其余区域，目标区域保持可交互（用户可边看提示边尝试操作）；
 * - 步骤支持「演示」动作：点击后执行页面提供的示例操作，并在面板内回显结果；
 * - 面板提供 跳过 / 上一步 / 下一步 / 完成；顶部显示进度条与步骤计数；
 * - 高亮矩形在滚动/缩放/内容变化后自动重新测量（rAF 节流）。
 */

export interface GuideStep {
  key: string;
  /** 高亮目标选择器；缺省表示整页暗化（无高亮框） */
  anchor?: string;
  title: string;
  body: string;
  /** 「演示此步骤」按钮文案（可选） */
  demoLabel?: string;
  /** 执行演示；返回结果提示文本 */
  onDemo?: () => string;
  /** 下一步按钮文案（默认「下一步」，最后一步默认「完成引导」） */
  nextLabel?: string;
}

export interface SpotlightGuideProps {
  steps: GuideStep[];
  open: boolean;
  /** 结束引导：completed=true 表示走到最后一步完成；false 表示跳过 */
  onExit: (completed: boolean) => void;
  /** 步骤切换回调（进入某一步时触发，可让页面同步状态，如开启/退出编辑态） */
  onStepChange?: (index: number, step: GuideStep) => void;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isRect(r: Rect): boolean {
  return r.width > 0 && r.height > 0;
}

export default function SpotlightGuide({
  steps,
  open,
  onExit,
  onStepChange,
}: SpotlightGuideProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [demoMsg, setDemoMsg] = useState("");
  const rafRef = useRef(0);
  const lastIndexRef = useRef(-1);

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  const measure = useCallback(() => {
    if (!open) return;
    const current = steps[Math.min(index, steps.length - 1)];
    if (!current?.anchor) {
      setRect(null);
      return;
    }
    const el = document.querySelector(current.anchor);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, [open, index, steps]);

  // 步骤切换：滚动到目标、重置演示提示、通知页面同步状态
  useEffect(() => {
    if (!open) return;
    if (lastIndexRef.current !== index) {
      lastIndexRef.current = index;
      setDemoMsg("");
      const current = steps[index];
      onStepChange?.(index, current);
      if (current?.anchor) {
        const el = document.querySelector(current.anchor);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [open, index, steps, onStepChange]);

  // 测量高亮矩形（进入步骤、滚动、缩放时刷新；rAF 节流）
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    let timer = 0;
    if (step?.anchor) {
      // 等平滑滚动结束后再测一次，取更稳的矩形
      timer = window.setTimeout(measure, 450);
    }
    const onViewportChange = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, measure, step?.anchor, step?.key]);

  // 打开时从第一步开始
  useEffect(() => {
    if (open) {
      setIndex(0);
      setDemoMsg("");
      lastIndexRef.current = -1;
    } else {
      setRect(null);
    }
  }, [open]);

  if (!open || !step) return null;

  const goNext = () => {
    if (isLast) {
      onExit(true);
    } else {
      setIndex((v) => v + 1);
    }
  };
  const goPrev = () => {
    if (index > 0) setIndex((v) => v - 1);
  };
  const runDemo = () => {
    if (!step.onDemo) return;
    const message = step.onDemo();
    setDemoMsg(message || "演示完成");
  };

  // 高亮遮罩：目标四周四条压暗条 + 高亮边框；无目标时整屏暗化
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const strips = rect && isRect(rect)
    ? [
        { key: "top", top: 0, left: 0, width: viewport.w, height: Math.max(rect.top, 0) },
        { key: "bottom", top: rect.top + rect.height, left: 0, width: viewport.w, height: Math.max(viewport.h - rect.top - rect.height, 0) },
        { key: "left", top: rect.top, left: 0, width: Math.max(rect.left, 0), height: rect.height },
        { key: "right", top: rect.top, left: rect.left + rect.width, width: Math.max(viewport.w - rect.left - rect.width, 0), height: rect.height },
      ]
    : null;

  const progress = ((index + 1) / steps.length) * 100;

  const panel = (
    <div className="spotlight-panel" role="dialog" aria-modal="true" aria-label="新手引导">
      <div className="spotlight-progress">
        <div className="spotlight-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="spotlight-panel-head">
        <span className="spotlight-step-count">
          第 {index + 1} / {steps.length} 步
        </span>
        <button type="button" className="spotlight-skip" onClick={() => onExit(false)}>
          跳过引导
        </button>
      </div>
      <h3 className="spotlight-title">{step.title}</h3>
      <p className="spotlight-body">{step.body}</p>

      {step.demoLabel && (
        <button type="button" className="spotlight-demo-btn" onClick={runDemo}>
          ✨ {step.demoLabel}
        </button>
      )}
      {demoMsg && <p className="spotlight-demo-msg">{demoMsg}</p>}

      <div className="spotlight-nav">
        <button
          type="button"
          className="spotlight-btn is-ghost"
          disabled={index === 0}
          onClick={goPrev}
        >
          上一步
        </button>
        <button type="button" className="spotlight-btn is-primary" onClick={goNext}>
          {isLast ? (step.nextLabel ?? "完成引导") : (step.nextLabel ?? "下一步")}
        </button>
      </div>
      {/* AI 生成声明水印 */}
      <span className="spotlight-watermark">引导内容由 AI 生成</span>
    </div>
  );

  return createPortal(
    <div className="spotlight-layer">
      {strips ? (
        <>
          {strips.map((s) => (
            <div
              key={s.key}
              className="spotlight-strip"
              style={{ top: s.top, left: s.left, width: s.width, height: s.height }}
            />
          ))}
          <div
            className="spotlight-ring"
            style={{ top: rect!.top, left: rect!.left, width: rect!.width, height: rect!.height }}
          />
        </>
      ) : (
        <div className="spotlight-strip spotlight-full" />
      )}
      {panel}
    </div>,
    document.body
  );
}
