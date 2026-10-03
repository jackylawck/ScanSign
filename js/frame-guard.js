// js/frame-guard.js
(function enforceFrameIsolation() {
  if (window.top !== window.self) {
    // 1. 立即設置全域阻斷標誌，阻止後續所有非同步 ES Module (如 app.js) 執行
    window.__FRAME_BLOCKED__ = true;

    // 2. 使用 classList.add 增量賦予封鎖樣式，避免覆蓋 <html> 既有的主題或語系 class
    document.documentElement.classList.add("frame-blocked");

    try {
      // 嘗試跳出 iframe 導向頂層視窗
      window.top.location = window.self.location;
    } catch (e) {
      // 跨源或 sandbox 限制阻斷時，銷毀 body 內容並呈現警告
      // 堅持絕不更動 <head>，確保原生的 Content-Security-Policy 繼續強制生效
      const blockUI = () => {
        if (!document.body) return;

        // 純原生 DOM API 構建：徹底避免 innerHTML 與 inline style，100% 相容嚴格 CSP (style-src 'self')
        const modal = document.createElement("div");
        modal.className = "frame-blocked-modal";

        const title = document.createElement("div");
        title.textContent = "⛔ 本系統禁止嵌入框架 (Clickjacking Protection)";

        const detail = document.createElement("span");
        detail.className = "frame-blocked-detail";
        detail.textContent = "Embedded frames strictly forbidden for security and privacy compliance.";

        modal.appendChild(title);
        modal.appendChild(detail);

        // 使用現代安全 API replaceChildren 清空 body 並注入警告 DOM
        document.body.replaceChildren(modal);
      };

      if (document.body) {
        blockUI();
      } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", blockUI);
      } else {
        blockUI();
      }
    }

    // 注意：在經典同步腳本中，throw 只會終止當前腳本線程；
    // 後續模組 (如 app.js) 是透過其頂部檢查 window.__FRAME_BLOCKED__ 主動終止初始化。
    throw new Error("[Security] Frame embedding forbidden. Execution halted.");
  }
})();
