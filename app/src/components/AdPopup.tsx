import { useEffect, useState } from "react";

const AD_IMAGE = "/pic/19347D35AE8A38635A6623F24F1FC5CA.jpg";

/**
 * AdPopup —— 右下角趣味广告弹窗（首页趣味功能）。
 *
 * 实现要点：
 * - 固定定位在页面右下角，展示一张趣味图片；
 * - 图片整体可点击，新窗口跳转教务系统（https://jwzs.cau.edu.cn/index.html）；
 * - 图片之上覆盖一层白色空 div，其透明度按固定间隔「突变」切换
 *   （不使用 CSS transition，opacity 直接跳变，形成闪烁效果）；
 * - 右上角提供 × 关闭按钮，点击后弹窗关闭（会话内不再显示）。
 */
export default function AdPopup() {
  const [visible, setVisible] = useState(true);
  const [flashOn, setFlashOn] = useState(false);

  // 闪烁：定时突变遮罩透明度（无过渡动画 → 突跳闪烁）
  useEffect(() => {
    const timer = setInterval(() => {
      setFlashOn((v) => !v);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="ad-popup" role="dialog" aria-label="趣味广告">
      <button
        type="button"
        className="ad-popup-close"
        onClick={() => setVisible(false)}
        aria-label="关闭广告"
        title="关闭"
      >
        ×
      </button>
      <div className="ad-popup-body">
        {/* 图片整体可点击，跳转教务系统 */}
        <a
          className="ad-popup-link"
          href="https://jwzs.cau.edu.cn/index.html"
          target="_blank"
          rel="noopener noreferrer"
          title="点击了解详情"
        >
          <img className="ad-popup-img" src={AD_IMAGE} alt="趣味广告" />
        </a>
        {/* 白色闪烁遮罩：opacity 在 0 与 0.9 之间突变 */}
        <div className="ad-popup-flash" style={{ opacity: flashOn ? 0.9 : 0 }} />
      </div>
    </div>
  );
}
