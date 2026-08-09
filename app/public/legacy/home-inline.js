        // 趣味功能区选项卡切换（带绿色光影滑动 + 阴影生长动画）
        (function () {
            const tabsContainer = document.getElementById('FunTabs');
            const tabs = tabsContainer.querySelectorAll('.fun-tab');
            const SLIDE_MS = 300; // 与 CSS 中 runner 滑动时长（0.28s）匹配，略留余量

            // 沿内容区上边缘滑动的绿色光影元素
            const runner = document.createElement('div');
            runner.className = 'fun-shadow-runner';
            tabsContainer.appendChild(runner);

            let settleTimer = null;

            tabs.forEach(function (tab) {
                tab.addEventListener('click', function () {
                    const oldTab = tabsContainer.querySelector('.fun-tab.active');
                    if (oldTab === tab) return; // 点击当前激活项不播动画

                    // 快速连点时先结算上一次动画
                    if (settleTimer) {
                        clearTimeout(settleTimer);
                        settleTimer = null;
                    }

                    // 旧按钮阴影消失，切换激活态与内容面板
                    tabs.forEach(function (t) { t.classList.remove('active', 'shadow-on'); });
                    tab.classList.add('active');
                    document.querySelectorAll('.fun-panel').forEach(function (panel) {
                        panel.classList.toggle('active', panel.id === tab.dataset.panel);
                    });

                    // 光影瞬移到旧按钮位置并显示
                    runner.style.transition = 'none';
                    runner.style.left = oldTab.offsetLeft + 'px';
                    runner.style.width = oldTab.offsetWidth + 'px';
                    runner.style.opacity = '1';
                    void runner.offsetWidth; // 强制 reflow，确保瞬移先生效
                    runner.style.transition = '';

                    // 滑动到新按钮位置
                    runner.style.left = tab.offsetLeft + 'px';
                    runner.style.width = tab.offsetWidth + 'px';

                    // 滑动到位后：新按钮阴影从下往上生长，光影淡出
                    settleTimer = setTimeout(function () {
                        settleTimer = null;
                        tab.classList.add('shadow-on');
                        runner.style.opacity = '0';
                    }, SLIDE_MS);
                });
            });

            // ===== 窝囊费打表日历：读取 data/fee-days.json 并高亮指定日期 =====
            const feeCalTitle = document.getElementById('FeeCalTitle');
            const feeCalGrid = document.getElementById('FeeCalGrid');
            const now = new Date();
            const feeCalState = { year: now.getFullYear(), month: now.getMonth() }; // month 从 0 起
            let feeHighlightDays = new Set(); // 存放 'YYYY-MM-DD' 字符串

            // 把日期拼成与 JSON 一致的 'YYYY-MM-DD' 格式
            function feeFormatDate(y, m, d) {
                return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            }

            function feeCalRender() {
                const y = feeCalState.year;
                const m = feeCalState.month;
                feeCalTitle.textContent = y + '年' + (m + 1) + '月';
                feeCalGrid.innerHTML = '';

                // 周一起始的偏移量与当月天数
                const offset = (new Date(y, m, 1).getDay() + 6) % 7;
                const daysInMonth = new Date(y, m + 1, 0).getDate();

                for (let i = 0; i < offset; i++) {
                    feeCalGrid.appendChild(document.createElement('span'));
                }
                for (let d = 1; d <= daysInMonth; d++) {
                    const cell = document.createElement('span');
                    cell.textContent = d;
                    if (feeHighlightDays.has(feeFormatDate(y, m, d))) {
                        cell.classList.add('fee-day-highlight');
                    }
                    feeCalGrid.appendChild(cell);
                }
            }

            document.getElementById('FeeCalPrev').addEventListener('click', function () {
                feeCalState.month--;
                if (feeCalState.month < 0) { feeCalState.month = 11; feeCalState.year--; }
                feeCalRender();
            });
            document.getElementById('FeeCalNext').addEventListener('click', function () {
                feeCalState.month++;
                if (feeCalState.month > 11) { feeCalState.month = 0; feeCalState.year++; }
                feeCalRender();
            });

            // 读取高亮日期；失败时日历照常渲染，仅无高亮
            fetch('./data/fee-days.json')
                .then(function (res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                })
                .then(function (days) {
                    if (Array.isArray(days)) feeHighlightDays = new Set(days);
                })
                .catch(function (err) {
                    console.warn('窝囊费打表：读取 data/fee-days.json 失败，按无高亮渲染。', err);
                })
                .finally(feeCalRender);
        })();
    
