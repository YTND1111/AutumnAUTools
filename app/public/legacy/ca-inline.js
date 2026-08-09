        (function () {
            const openNoticeButton = document.getElementById("OpenNoticeButton");
            if (openNoticeButton && typeof createFloatingWindow === "function") {
                openNoticeButton.addEventListener("click", () => {
                    createFloatingWindow("./cn.html?file=src/py/附件2：2026-2027学年秋学期通知单课表.xls", {
                        title: "通知单课表",
                        width: Math.min(1100, window.innerWidth * 0.85),
                        height: Math.min(720, window.innerHeight * 0.78)
                    });
                });
            }
        })();
    
