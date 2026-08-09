import { useEffect, useRef } from "react";

/**
 * 遗留页面定义：原静态 HTML 页面在 React 中的挂载描述。
 * 迁移原则为「零业务代码改动」——HTML 结构原样注入，原始 JS 原样执行。
 */
export interface LegacyPageDef {
  /** 页面标题，挂载时写入 document.title */
  title: string;
  /** public/ 下的 HTML 片段路径（<style> 块 + 去除 <script> 的 body 内容） */
  htmlUrl: string;
  /**
   * 全局常量脚本（version-*.js，顶层 const 定义 APP_VERSION_*）。
   * 整个会话仅加载一次：全局词法绑定对后续所有脚本可见，
   * 重复加载会报「重复声明」错误，因此必须去重。
   */
  globalScripts?: string[];
  /**
   * 页面脚本，每次挂载按顺序在各自独立的函数作用域内执行。
   * 独立作用域避免 SPA 重复挂载时顶层 const/let 的全局重复声明冲突；
   * 跨脚本共享仅依赖 window 全局（如 window.createFloatingWindow），不受影响。
   */
  pageScripts: string[];
}

/** 已加载的全局常量脚本记录（会话级去重） */
const loadedGlobalScripts = new Set<string>();

function loadGlobalScriptOnce(src: string): Promise<void> {
  if (loadedGlobalScripts.has(src)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => {
      loadedGlobalScripts.add(src);
      resolve();
    };
    el.onerror = () => reject(new Error(`全局脚本加载失败: ${src}`));
    document.body.appendChild(el);
  });
}

/**
 * 遗留页面挂载组件：fetch HTML 片段注入容器，再按原顺序执行原始脚本。
 * 卸载时清空容器，DOM 级事件监听随元素销毁；
 * 原始脚本中 document/window 级监听仅操作悬浮球等已分离元素，无副作用。
 */
export default function LegacyPage(def: LegacyPageDef) {
  const { title, htmlUrl, globalScripts, pageScripts } = def;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = title;
    let cancelled = false;
    const container = containerRef.current;

    (async () => {
      // 1. 注入页面结构与 <style>
      const html = await (await fetch(htmlUrl)).text();
      if (cancelled || !container) return;
      container.innerHTML = html;

      // 2. 版本常量脚本：会话内仅加载一次
      for (const src of globalScripts ?? []) {
        await loadGlobalScriptOnce(src);
      }
      if (cancelled) return;

      // 3. 页面脚本：逐个拉取源码，在独立函数作用域内执行
      for (const src of pageScripts) {
        const code = await (await fetch(src)).text();
        if (cancelled) return;
        // sourceURL 便于在 DevTools 中按原始文件路径调试
        new Function(`${code}\n//# sourceURL=${src}`)();
      }
    })().catch((err) => {
      console.error(`[LegacyPage] 页面初始化失败: ${htmlUrl}`, err);
    });

    return () => {
      cancelled = true;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [title, htmlUrl, globalScripts, pageScripts]);

  return <div ref={containerRef} className="legacy-page" />;
}
