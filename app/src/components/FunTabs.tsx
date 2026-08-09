import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * FunTabs —— 趣味功能选项卡（原 index.html 内联脚本的 React 重写）。
 *
 * 保留原动画细节：
 * - 切换时绿色光影（.fun-shadow-runner）沿内容区上边缘从旧按钮滑到新按钮；
 * - 滑动到位后新按钮的绿色发光阴影从下往上生长（.shadow-on，延迟 SLIDE_MS 结算）；
 * - 快速连点时先结算上一次动画（清理未完成的定时器）。
 *
 * 与原实现的差异：激活态/阴影态由 useState 驱动 class，runner 位置仍直接操作
 * DOM style（一次性位移动画，不进状态，与原脚本一致且避免多余重渲染）。
 */

const SLIDE_MS = 300; // 与 CSS 中 runner 滑动时长（0.28s）匹配，略留余量

export interface FunPanelDef {
  /** 面板 id（同时作为 tab 的 data-panel 值） */
  id: string;
  label: string;
  content: ReactNode;
}

export default function FunTabs({ panels }: { panels: FunPanelDef[] }) {
  const [activeId, setActiveId] = useState(panels[0]?.id ?? "");
  const [shadowOn, setShadowOn] = useState(true); // 初始选中项带阴影（同原 DOM）
  const tabsRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef(0);

  // 卸载时清理未结算的动画定时器
  useEffect(() => {
    return () => {
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
      }
    };
  }, []);

  const handleTabClick = (panelId: string, tabEl: HTMLDivElement) => {
    if (panelId === activeId) return; // 点击当前激活项不播动画
    const container = tabsRef.current;
    const runner = runnerRef.current;
    if (!container || !runner) return;
    const oldTab = container.querySelector<HTMLElement>(`.fun-tab[data-panel="${activeId}"]`);
    if (!oldTab) return;

    // 快速连点时先结算上一次动画
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = 0;
    }

    // 旧按钮阴影消失，切换激活态与内容面板
    setShadowOn(false);
    setActiveId(panelId);

    // 光影瞬移到旧按钮位置并显示
    runner.style.transition = "none";
    runner.style.left = oldTab.offsetLeft + "px";
    runner.style.width = oldTab.offsetWidth + "px";
    runner.style.opacity = "1";
    void runner.offsetWidth; // 强制 reflow，确保瞬移先生效
    runner.style.transition = "";

    // 滑动到新按钮位置
    runner.style.left = tabEl.offsetLeft + "px";
    runner.style.width = tabEl.offsetWidth + "px";

    // 滑动到位后：新按钮阴影从下往上生长，光影淡出
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = 0;
      setShadowOn(true);
      runner.style.opacity = "0";
    }, SLIDE_MS);
  };

  return (
    <>
      <div className="fun-tabs" ref={tabsRef}>
        {panels.map((panel) => (
          <div
            key={panel.id}
            className={`fun-tab${panel.id === activeId ? " active" : ""}${
              panel.id === activeId && shadowOn ? " shadow-on" : ""
            }`}
            data-panel={panel.id}
            onClick={(e) => handleTabClick(panel.id, e.currentTarget)}
          >
            {panel.label}
          </div>
        ))}
        {/* 沿内容区上边缘滑动的绿色光影元素 */}
        <div className="fun-shadow-runner" ref={runnerRef} />
      </div>
      {panels.map((panel) => (
        <div key={panel.id} className={`fun-panel${panel.id === activeId ? " active" : ""}`} id={panel.id}>
          {panel.content}
        </div>
      ))}
    </>
  );
}
