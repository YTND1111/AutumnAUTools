import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * useFloatingBall —— 由 js/index.js 忠实移植的悬浮球逻辑 Hook。
 *
 * 行为与原脚本完全一致：指针拖拽、边缘吸附（静态四分之一可见 / hover 半圆伸出）、
 * 点击开关侧边栏、拖动后 click 去抖、失焦吸附判定、视口变化重算边界、
 * 右下角默认落位（含小屏边距保护）、rAF 合帧渲染。
 *
 * 与原脚本的差异（均为 React 化收益）：
 * - getElementById 改为 ref 注入；
 * - 全部事件监听在组件卸载时精确移除（原脚本在 SPA 路由切换后会残留监听）；
 * - 通过返回值暴露 closeSidebar，供导航后主动收起侧边栏。
 */

const BALL_SIZE = 100;
const BALL_RADIUS = BALL_SIZE / 2;
const MIN_VISIBLE = BALL_SIZE / 4;
const EDGE_NEAR = BALL_RADIUS / 2;
const DEFAULT_MARGIN = 24;

export interface FloatingBallApi {
  /** 主动收起侧边栏（如点击侧边栏链接导航后） */
  closeSidebar: () => void;
}

export function useFloatingBall(
  ballRef: RefObject<HTMLDivElement | null>,
  backdropRef: RefObject<HTMLDivElement | null>,
  sidebarRef: RefObject<HTMLDivElement | null>
): FloatingBallApi {
  // 稳定引用：挂载后填充 closeSidebar 实现，避免调用方依赖 effect 时序
  const apiRef = useRef<FloatingBallApi>({ closeSidebar: () => {} });

  useEffect(() => {
    const floatingBall = ballRef.current;
    const pageBackdrop = backdropRef.current;
    const sidebar = sidebarRef.current;
    if (!floatingBall || !pageBackdrop || !sidebar) return;

    let posX = 0;
    let posY = 0;
    let nextX = 0;
    let nextY = 0;
    let rafId = 0;

    let pointerId = -1;
    let downX = 0;
    let downY = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragged = false;
    let suppressClick = false;

    let isDocked = false;
    let dockSide = "";

    function setSidebarOpen(isOpen: boolean) {
      sidebar!.classList.toggle("is-open", isOpen);
      pageBackdrop!.classList.toggle("is-active", isOpen);
      floatingBall!.classList.toggle("is-expanded", isOpen);
    }

    function getViewport() {
      return { width: window.innerWidth, height: window.innerHeight };
    }

    function clamp(value: number, min: number, max: number) {
      return Math.min(max, Math.max(min, value));
    }

    function clampBallPosition(x: number, y: number) {
      // 拖动约束：至少保留四分之一直径在屏幕内
      const { width, height } = getViewport();
      const minX = -(BALL_SIZE - MIN_VISIBLE);
      const maxX = width - MIN_VISIBLE;
      const minY = -(BALL_SIZE - MIN_VISIBLE);
      const maxY = height - MIN_VISIBLE;
      return {
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
      };
    }

    function paintBall() {
      rafId = 0;
      floatingBall!.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    }

    function commitPosition(x: number, y: number) {
      // 常规提交：通过 rAF 合帧更新位置
      const bounded = clampBallPosition(x, y);
      posX = bounded.x;
      posY = bounded.y;
      nextX = bounded.x;
      nextY = bounded.y;
      if (!rafId) {
        rafId = requestAnimationFrame(paintBall);
      }
    }

    function commitPositionImmediate(x: number, y: number) {
      // 初始化提交：直接写 transform，避免首帧过渡动画
      const bounded = clampBallPosition(x, y);
      posX = bounded.x;
      posY = bounded.y;
      nextX = bounded.x;
      nextY = bounded.y;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      floatingBall!.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    }

    function getNearestEdge(x: number, y: number) {
      // 根据圆心到四边距离判断是否靠近边缘
      const { width, height } = getViewport();
      const centerX = x + BALL_RADIUS;
      const centerY = y + BALL_RADIUS;
      const distances = [
        { side: "left", value: centerX },
        { side: "right", value: width - centerX },
        { side: "top", value: centerY },
        { side: "bottom", value: height - centerY },
      ];

      let nearest = distances[0];
      for (let i = 1; i < distances.length; i += 1) {
        if (distances[i].value < nearest.value) {
          nearest = distances[i];
        }
      }

      return nearest.value < EDGE_NEAR ? nearest.side : "";
    }

    function getDockX(side: string, hover: boolean) {
      const { width } = getViewport();
      if (side === "left") {
        return hover ? -BALL_RADIUS : -(BALL_SIZE - MIN_VISIBLE);
      }
      if (side === "right") {
        return hover ? width - BALL_RADIUS : width - MIN_VISIBLE;
      }
      return posX;
    }

    function getDockY(side: string, hover: boolean) {
      const { height } = getViewport();
      if (side === "top") {
        return hover ? -BALL_RADIUS : -(BALL_SIZE - MIN_VISIBLE);
      }
      if (side === "bottom") {
        return hover ? height - BALL_RADIUS : height - MIN_VISIBLE;
      }
      return posY;
    }

    function applyDock(hover = false) {
      // 吸附态位置：静态四分之一可见，hover 时半径可见
      if (!isDocked || !dockSide) {
        return;
      }

      const targetX = getDockX(dockSide, hover);
      const targetY = getDockY(dockSide, hover);
      commitPosition(targetX, targetY);
    }

    function tryDockFromFocusLoss() {
      // 失焦后仅在“靠边”时进入吸附态
      const side = getNearestEdge(posX, posY);
      if (!side) {
        isDocked = false;
        dockSide = "";
        return;
      }
      isDocked = true;
      dockSide = side;
      applyDock(false);
    }

    function getAdaptiveDefaultMargin() {
      // 小屏保护：默认边距不超过当前视口可承受的安全值
      const { width, height } = getViewport();
      const safeX = Math.max(0, (width - BALL_SIZE) / 2);
      const safeY = Math.max(0, (height - BALL_SIZE) / 2);
      return Math.min(DEFAULT_MARGIN, safeX, safeY);
    }

    function initDefaultPosition(immediate = false) {
      // 默认位置：右下角且完整可见，并带小屏边距保护
      const { width, height } = getViewport();
      const margin = getAdaptiveDefaultMargin();
      const x = width - BALL_SIZE - margin;
      const y = height - BALL_SIZE - margin;
      if (immediate) {
        commitPositionImmediate(x, y);
        return;
      }
      commitPosition(x, y);
    }

    function onPointerDown(event: PointerEvent) {
      // 记录拖动起点并进入拖动态
      pointerId = event.pointerId;
      downX = event.clientX;
      downY = event.clientY;
      dragStartX = posX;
      dragStartY = posY;
      dragged = false;
      isDocked = false;
      dockSide = "";
      floatingBall!.classList.add("is-dragging");
      floatingBall!.focus({ preventScroll: true });
      floatingBall!.setPointerCapture(pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) {
        return;
      }

      // 拖动过程先按约束计算，再交给 rAF 合帧渲染
      const rawX = dragStartX + (event.clientX - downX);
      const rawY = dragStartY + (event.clientY - downY);
      const bounded = clampBallPosition(rawX, rawY);
      nextX = bounded.x;
      nextY = bounded.y;

      if (!dragged && Math.hypot(event.clientX - downX, event.clientY - downY) > 3) {
        dragged = true;
      }

      if (!rafId) {
        rafId = requestAnimationFrame(paintBall);
      }
    }

    function onPointerEnd(event: PointerEvent) {
      if (event.pointerId !== pointerId) {
        return;
      }

      // 拖动结束提交位置，并屏蔽本次拖动后的 click
      posX = nextX;
      posY = nextY;
      suppressClick = dragged;

      if (floatingBall!.hasPointerCapture(pointerId)) {
        floatingBall!.releasePointerCapture(pointerId);
      }
      pointerId = -1;
      floatingBall!.classList.remove("is-dragging");
    }

    function onBallClick(event: MouseEvent) {
      // 点击悬浮球开关侧边栏；拖动后的 click 不触发开关
      event.stopPropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      setSidebarOpen(!sidebar!.classList.contains("is-open"));
    }

    function onBallBlur() {
      // 失焦时尝试吸附
      tryDockFromFocusLoss();
    }

    function onBallMouseEnter() {
      // 吸附态 hover：向外伸出到圆心贴边
      applyDock(true);
    }

    function onBallMouseLeave() {
      // 吸附态 hover 结束：恢复静态吸附位
      applyDock(false);
    }

    function onSidebarClick(event: MouseEvent) {
      // 点击侧边栏内部不触发外部区域收起
      event.stopPropagation();
    }

    function onBackdropClick() {
      // 点击遮罩层直接收起
      setSidebarOpen(false);
    }

    function onDocumentClick(event: MouseEvent) {
      // 点击非侧边栏区域时收起侧边栏，并使悬浮球失焦触发吸附判定
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("#NavSidebar") && !target.closest("#floatingBall")) {
        setSidebarOpen(false);
        if (document.activeElement === floatingBall) {
          floatingBall!.blur();
        }
      }
    }

    function onWindowResize() {
      // 视口变化后重算边界与吸附位，保证位置合法
      if (isDocked) {
        applyDock(false);
        return;
      }
      commitPosition(posX, posY);
    }

    floatingBall.addEventListener("pointerdown", onPointerDown);
    floatingBall.addEventListener("pointermove", onPointerMove);
    floatingBall.addEventListener("pointerup", onPointerEnd);
    floatingBall.addEventListener("pointercancel", onPointerEnd);
    floatingBall.addEventListener("click", onBallClick);
    floatingBall.addEventListener("blur", onBallBlur);
    floatingBall.addEventListener("mouseenter", onBallMouseEnter);
    floatingBall.addEventListener("mouseleave", onBallMouseLeave);
    sidebar.addEventListener("click", onSidebarClick);
    pageBackdrop.addEventListener("click", onBackdropClick);
    document.addEventListener("click", onDocumentClick);
    window.addEventListener("resize", onWindowResize);

    // 对外暴露：主动收起侧边栏
    apiRef.current.closeSidebar = () => setSidebarOpen(false);

    // 初始化修复：先无动画落位，再开启位移动画能力
    initDefaultPosition(true);
    let readyFrame = requestAnimationFrame(() => {
      // 第一帧先显示，仍不启用 transform 过渡
      floatingBall.classList.add("is-ready");
      readyFrame = requestAnimationFrame(() => {
        // 第二帧再启用 transform 过渡，彻底避开初始化竞态
        floatingBall.classList.add("is-motion-ready");
      });
    });

    return () => {
      // 精确清理：移除全部监听并取消待渲染帧（原脚本在 SPA 切换后会残留）
      floatingBall.removeEventListener("pointerdown", onPointerDown);
      floatingBall.removeEventListener("pointermove", onPointerMove);
      floatingBall.removeEventListener("pointerup", onPointerEnd);
      floatingBall.removeEventListener("pointercancel", onPointerEnd);
      floatingBall.removeEventListener("click", onBallClick);
      floatingBall.removeEventListener("blur", onBallBlur);
      floatingBall.removeEventListener("mouseenter", onBallMouseEnter);
      floatingBall.removeEventListener("mouseleave", onBallMouseLeave);
      sidebar.removeEventListener("click", onSidebarClick);
      pageBackdrop.removeEventListener("click", onBackdropClick);
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("resize", onWindowResize);
      if (rafId) cancelAnimationFrame(rafId);
      if (readyFrame) cancelAnimationFrame(readyFrame);
      apiRef.current.closeSidebar = () => {};
    };
  }, [ballRef, backdropRef, sidebarRef]);

  return apiRef.current;
}
