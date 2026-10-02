// js/frame-guard.js
(function enforceFrameIsolation() {
  if (window.top !== window.self) {
    // 設置全域阻斷標誌，阻止非同步 ES Module 執行
    window.__FRAME_BLOCKED__ = true;

    try {
      window.top.location = window.self.location;
    } catch (e) {
      // 跨源限制時只修改 body，絕不覆寫 documentElement，確保 <head> 的 CSP 生效
      document.documentElement.className = "frame-blocked";
      const blockUI = () => {
        document.body.innerHTML = '<div class="frame-blocked-modal">⛔ Embedded frames strictly forbidden.</div>';
      };
      if (document.body) {
        blockUI();
      } else {
        document.addEventListener("DOMContentLoaded", blockUI);
      }
    }
    throw new Error("[Security] Frame embedding forbidden.");
  }
})();
