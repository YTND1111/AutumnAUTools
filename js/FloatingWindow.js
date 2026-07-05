// 可拖拽、可关闭、可缩放边框的 iframe 悬浮窗模块
// 通过 createFloatingWindow(src, options) 创建，返回 { close, focus, container }

(function () {
    "use strict";

    let zIndexBase = 300;
    const MIN_WIDTH = 320;
    const MIN_HEIGHT = 220;
    const HANDLES = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function createElement(tag, className, parent) {
        const el = document.createElement(tag);
        if (className) {
            el.className = className;
        }
        if (parent) {
            parent.appendChild(el);
        }
        return el;
    }

    function parseDirection(handle) {
        return {
            n: handle.includes("n"),
            s: handle.includes("s"),
            e: handle.includes("e"),
            w: handle.includes("w")
        };
    }

    /**
     * 创建悬浮窗
     * @param {string} src - iframe 加载的页面地址
     * @param {object} [options={}] - 配置项
     * @param {string} [options.title="悬浮窗"] - 标题
     * @param {number} [options.width=800] - 初始宽度
     * @param {number} [options.height=500] - 初始高度
     * @param {number} [options.x] - 初始 left，默认居中
     * @param {number} [options.y] - 初始 top，默认居中
     * @param {function} [options.onClose] - 关闭后的回调
     */
    function createFloatingWindow(src, options = {}) {
        const title = options.title || "悬浮窗";
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const width = clamp(options.width || viewportWidth * 0.8, MIN_WIDTH, viewportWidth);
        const height = clamp(options.height || viewportHeight * 0.7, MIN_HEIGHT, viewportHeight);
        const x = options.x !== undefined ? options.x : (viewportWidth - width) / 2;
        const y = options.y !== undefined ? options.y : (viewportHeight - height) / 2;

        const container = createElement("div", "floating-window", document.body);
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.left = `${clamp(x, 0, viewportWidth - width)}px`;
        container.style.top = `${clamp(y, 0, viewportHeight - height)}px`;
        container.style.zIndex = String(++zIndexBase);

        const header = createElement("div", "floating-window-header", container);
        const titleEl = createElement("span", "floating-window-title", header);
        titleEl.textContent = title;
        const closeBtn = createElement("button", "floating-window-close", header);
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "关闭悬浮窗");
        closeBtn.textContent = "×";

        const body = createElement("div", "floating-window-body", container);
        const iframe = createElement("iframe", "", body);
        iframe.src = src;
        iframe.setAttribute("title", title);

        HANDLES.forEach((handle) => {
            createElement("div", `resize-handle ${handle}`, container).dataset.handle = handle;
        });

        // 激活时置顶
        function bringToFront() {
            container.style.zIndex = String(++zIndexBase);
        }

        container.addEventListener("pointerdown", bringToFront);

        // 关闭
        function close() {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
            if (typeof options.onClose === "function") {
                options.onClose();
            }
        }

        closeBtn.addEventListener("click", close);

        // 拖拽实现
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartLeft = 0;
        let dragStartTop = 0;

        header.addEventListener("pointerdown", (event) => {
            if (event.target === closeBtn) {
                return;
            }
            isDragging = true;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            const rect = container.getBoundingClientRect();
            dragStartLeft = rect.left;
            dragStartTop = rect.top;
            container.classList.add("is-dragging");
            header.setPointerCapture(event.pointerId);
            bringToFront();
        });

        header.addEventListener("pointermove", (event) => {
            if (!isDragging) {
                return;
            }
            const dx = event.clientX - dragStartX;
            const dy = event.clientY - dragStartY;
            const rect = container.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;
            container.style.left = `${clamp(dragStartLeft + dx, 0, maxLeft)}px`;
            container.style.top = `${clamp(dragStartTop + dy, 0, maxTop)}px`;
        });

        header.addEventListener("pointerup", (event) => {
            if (!isDragging) {
                return;
            }
            isDragging = false;
            container.classList.remove("is-dragging");
            header.releasePointerCapture(event.pointerId);
        });

        // 缩放实现
        let isResizing = false;
        let resizeDir = null;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let resizeStartRect = null;

        container.addEventListener("pointerdown", (event) => {
            const handle = event.target.closest(".resize-handle");
            if (!handle) {
                return;
            }
            event.preventDefault();
            isResizing = true;
            resizeDir = parseDirection(handle.dataset.handle);
            resizeStartX = event.clientX;
            resizeStartY = event.clientY;
            resizeStartRect = container.getBoundingClientRect();
            container.classList.add("is-resizing");
            handle.setPointerCapture(event.pointerId);
            bringToFront();
        });

        container.addEventListener("pointermove", (event) => {
            if (!isResizing || !resizeDir) {
                return;
            }
            const dx = event.clientX - resizeStartX;
            const dy = event.clientY - resizeStartY;
            const startLeft = resizeStartRect.left;
            const startTop = resizeStartRect.top;
            const startWidth = resizeStartRect.width;
            const startHeight = resizeStartRect.height;

            let newLeft = startLeft;
            let newTop = startTop;
            let newWidth = startWidth;
            let newHeight = startHeight;

            if (resizeDir.e) {
                newWidth = clamp(startWidth + dx, MIN_WIDTH, window.innerWidth - startLeft);
            }
            if (resizeDir.s) {
                newHeight = clamp(startHeight + dy, MIN_HEIGHT, window.innerHeight - startTop);
            }
            if (resizeDir.w) {
                const minLeft = Math.max(0, startLeft + startWidth - window.innerWidth + MIN_WIDTH);
                const proposedLeft = clamp(startLeft + dx, minLeft, startLeft + startWidth - MIN_WIDTH);
                newWidth = startWidth + startLeft - proposedLeft;
                newLeft = proposedLeft;
            }
            if (resizeDir.n) {
                const minTop = Math.max(0, startTop + startHeight - window.innerHeight + MIN_HEIGHT);
                const proposedTop = clamp(startTop + dy, minTop, startTop + startHeight - MIN_HEIGHT);
                newHeight = startHeight + startTop - proposedTop;
                newTop = proposedTop;
            }

            container.style.left = `${newLeft}px`;
            container.style.top = `${newTop}px`;
            container.style.width = `${newWidth}px`;
            container.style.height = `${newHeight}px`;
        });

        container.addEventListener("pointerup", (event) => {
            if (!isResizing) {
                return;
            }
            isResizing = false;
            resizeDir = null;
            container.classList.remove("is-resizing");
            if (event.target.closest(".resize-handle")) {
                event.target.closest(".resize-handle").releasePointerCapture(event.pointerId);
            }
        });

        function focus() {
            bringToFront();
        }

        return { close, focus, container };
    }

    window.createFloatingWindow = createFloatingWindow;
})();
