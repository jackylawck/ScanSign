// js/frame-guard.js
(function enforceFrameIsolation() {
  if (window.top !== window.self) {
    // 1. 立即設置全域阻斷標誌，阻止後續所有非同步 ES Module 執行
    window.__FRAME_BLOCKED__ = true;

    // 2. 立即將根元素設為封鎖樣式，防止被透明 iframe 點擊劫持 (Clickjacking)
    document.documentElement.className = "frame-blocked";

    try {
      // 嘗試跳出 iframe 導向頂層
      window.top.location = window.self.location;
    } catch (e) {
      // 跨源或 sandbox 限制時，銷毀 body 內容並呈現警告，絕不覆寫 <head> 確保 CSP 繼續生效
      const blockUI = () => {
        if (document.body) {
          document.body.innerHTML = `
            <div class="frame-blocked-modal">
              ⛔ 本系統禁止嵌入框架 (Clickjacking Protection)<br>
              <span style="font-size: 14px; color: #94a3b8; font-weight: normal; margin-top: 8px; display: block;">
                Embedded frames strictly forbidden for security and privacy compliance.
              </span>
            </div>
          `;
        }
      };

      if (document.body) {
        blockUI();
      } else {
        document.addEventListener("DOMContentLoaded", blockUI);
      }
    }

    throw new Error("[Security] Frame embedding forbidden. Execution halted.");
  }
})();
