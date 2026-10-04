// sw.js
// 注意：v202610040009-7ca9874 與 {
  "index.html": "sha256-Nkgu/hGB1RrKJgzus7JyLN2I4RRQu8LVG0IpM4az01o=",
  "manifest.webmanifest": "sha256-l6KlKHODnUr2YzQdU64KunXMQMNdB5NW5BN1oI20ne4=",
  "css/style.css": "sha256-u2hAtPJX3E41+UQP/y48AtBfX1C3dvpB5wwnSPx08FE=",
  "js/app.js": "sha256-xSO6EGvOY4tJFb9cXRaZRksNWa0lO8imf//XADh1OW8=",
  "js/crypto.js": "sha256-KWU+PCe8oGJmOyOCj7kkbGwKjVoLRZiizJI+NdGh/4E=",
  "js/scanner.js": "sha256-ojBNjg9nRXrt3enFzRwM2xVV+Z3+8jOb2Wyac+5Ge9Y=",
  "js/ui.js": "sha256-95jGpLxfUYkdJ0az9MXs5aMf0aT3lW81W3qgeiGOh2A=",
  "js/i18n.js": "sha256-LlliqTG3R62FMkz84TRNI5vBf2jUqLK0ANlubjdlGKE=",
  "js/admin.js": "sha256-OoiLXpPdvNG3bbXD5HZIj4zT4WqpV4MUXA01MMYwtSQ=",
  "js/search.js": "sha256-h5WXPaQ1MtE18D3vxaZJmEwQeWIjn8FmJu+vHJK4QvU=",
  "js/frame-guard.js": "sha256-/oszFOuTSHyV4fuBPfpeaLkAi65hrKWCGJLYVxi9Tyk=",
  "vendor/html5-qrcode.min.js": "sha256-mZISmh+5jk5UAJo5l8/32QizJMcQQg8C9ZkRzwPr53g=",
  "icons/ScanSign192icon.png": "sha256-9O5suNKloLWloyA8d4d2DQ8OvR0KhlawQo34TBMaE2U=",
  "icons/ScanSign512icon.png": "sha256-p758jmMXqqDvKNyGFG3uPu+Rl9HEMGjbLeOqShw6e7o="
} 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-v3-v202610040009-7ca9874";

// 由 inject_sw_integrity.py 自動注入之 W3C SRI 完整性雜湊表
const RESOURCE_INTEGRITY = {
  "index.html": "sha256-Nkgu/hGB1RrKJgzus7JyLN2I4RRQu8LVG0IpM4az01o=",
  "manifest.webmanifest": "sha256-l6KlKHODnUr2YzQdU64KunXMQMNdB5NW5BN1oI20ne4=",
  "css/style.css": "sha256-u2hAtPJX3E41+UQP/y48AtBfX1C3dvpB5wwnSPx08FE=",
  "js/app.js": "sha256-xSO6EGvOY4tJFb9cXRaZRksNWa0lO8imf//XADh1OW8=",
  "js/crypto.js": "sha256-KWU+PCe8oGJmOyOCj7kkbGwKjVoLRZiizJI+NdGh/4E=",
  "js/scanner.js": "sha256-ojBNjg9nRXrt3enFzRwM2xVV+Z3+8jOb2Wyac+5Ge9Y=",
  "js/ui.js": "sha256-95jGpLxfUYkdJ0az9MXs5aMf0aT3lW81W3qgeiGOh2A=",
  "js/i18n.js": "sha256-LlliqTG3R62FMkz84TRNI5vBf2jUqLK0ANlubjdlGKE=",
  "js/admin.js": "sha256-OoiLXpPdvNG3bbXD5HZIj4zT4WqpV4MUXA01MMYwtSQ=",
  "js/search.js": "sha256-h5WXPaQ1MtE18D3vxaZJmEwQeWIjn8FmJu+vHJK4QvU=",
  "js/frame-guard.js": "sha256-/oszFOuTSHyV4fuBPfpeaLkAi65hrKWCGJLYVxi9Tyk=",
  "vendor/html5-qrcode.min.js": "sha256-mZISmh+5jk5UAJo5l8/32QizJMcQQg8C9ZkRzwPr53g=",
  "icons/ScanSign192icon.png": "sha256-9O5suNKloLWloyA8d4d2DQ8OvR0KhlawQo34TBMaE2U=",
  "icons/ScanSign512icon.png": "sha256-p758jmMXqqDvKNyGFG3uPu+Rl9HEMGjbLeOqShw6e7o="
};

// 關鍵核心資產清單（SRI 雜湊不符或檔案丟失立即終止安裝，杜絕損壞版本上線）
const CRITICAL_ASSETS = [
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/app.js",
  "js/crypto.js",
  "js/scanner.js",
  "js/ui.js",
  "js/i18n.js",
  "js/admin.js",
  "js/search.js",
  "js/frame-guard.js",
  "vendor/html5-qrcode.min.js"
];

/**
 * 輔助工具：將 ArrayBuffer 轉為 Base64 字串 (採用 8KB 分塊拼接，兼顧效能與防爆棧)
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000; // 32KB
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * 1. Install 階段：原生相對路徑解析 (相容 GitHub Pages 子路徑) 與嚴格 SRI 校驗
 */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] 啟動預快取並執行 SRI 雜湊檢驗 (版本: ${CACHE_NAME})...`);

      // A. 校驗並快取所有在 RESOURCE_INTEGRITY 清單中的資源
      for (const [relPath, expectedHash] of Object.entries(RESOURCE_INTEGRITY)) {
        const isCritical = CRITICAL_ASSETS.includes(relPath);

        try {
          // 直接使用相對路徑 fetch，自動相容 https://user.github.io/repo-name/ 子路徑
          const res = await fetch(relPath, { cache: "no-cache" });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          // 核心密碼學：計算下載內容的 SHA-256 雜湊
          const buffer = await res.clone().arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", buffer);
          const actualHash = `sha256-${bufferToBase64(digest)}`;

          if (actualHash !== expectedHash) {
            console.error(`[SW SRI Mismatch] 資源完整性遭破壞或竄改: ${relPath}`);
            console.error(`預期: ${expectedHash} | 實際: ${actualHash}`);
            throw new Error(`SRI integrity mismatch for ${relPath}`);
          }

          await cache.put(relPath, res);
        } catch (err) {
          if (isCritical) {
            console.error(`[SW Fatal] 關鍵資源預快取或 SRI 校驗失敗，中斷安裝: ${relPath}`, err);
            throw err; // 嚴格阻斷 Service Worker 安裝
          } else {
            console.warn(`[SW Warning] 非關鍵資源載入失敗，略過: ${relPath}`, err);
          }
        }
      }

      // B. 預快取加密名冊 (已有 PBKDF2 + AES-GCM 內置密碼學完整性校驗)
      try {
        const res = await fetch("data/manifest.enc.json", { cache: "no-cache" });
        if (res.ok) {
          await cache.put("data/manifest.enc.json", res);
        }
      } catch (err) {
        console.warn("[SW] data/manifest.enc.json 預載入受限 (現場可改以手動上傳模式):", err);
      }
    }).then(() => {
      // 確保只有在預快取與 SRI 100% 通過後才接管
      return self.skipWaiting();
    })
  );
});

/**
 * 2. Activate 階段：清除舊版 Cache，立即接管所有開啟頁面
 */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log(`[SW] 清除過期快取: ${k}`);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * 3. Fetch 階段：離線優先 (Cache-First + Background Revalidation)
 * 具備非 200 網路故障回退快取與 SPA 導航兜底
 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  let requestUrl;
  try {
    requestUrl = new URL(e.request.url);
  } catch {
    return; // 忽略非合法 URL 請求 (如 chrome-extension:// 等)
  }

  // 僅攔截 http 與 https 協議
  if (!requestUrl.protocol.startsWith("http")) return;

  // 1. 加密名冊策略：純 Cache-First (防禦性 ignoreSearch)
  if (requestUrl.pathname.endsWith("manifest.enc.json")) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then((cached) => cached || fetch(e.request))
    );
    return;
  }

  // 2. 靜態資源策略：Cache-First，命中即瞬回；背景非同步拉取更新 (使用 async IIFE 避免時序錯誤)
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });

    if (cached) {
      // 背景非同步更新，不阻塞前端渲染與掃描響應
      fetch(e.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkRes.clone()).catch(() => {});
            });
          }
        })
        .catch(() => {}); // 斷網環境靜默忽視背景更新

      return cached;
    }

    // 無快取紀錄（首次存取）：發起網路請求
    try {
      const networkRes = await fetch(e.request);
      if (networkRes && networkRes.status === 200) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, networkRes.clone()).catch(() => {});
        });
        return networkRes;
      }

      // 網路返回 404/500 等異常：嘗試從快取回退（避免中斷用戶）
      const fallbackCached = await caches.match(e.request, { ignoreSearch: true });
      return fallbackCached || networkRes;
    } catch (err) {
      // 網路徹底斷開且為頁面導航：回退到根頁面 SPA 快取
      if (e.request.mode === "navigate") {
        const fallbackIndex = (await caches.match("index.html", { ignoreSearch: true })) ||
                              (await caches.match("./index.html", { ignoreSearch: true }));
        if (fallbackIndex) return fallbackIndex;
      }

      return new Response("Offline resource unavailable", { 
        status: 503, 
        statusText: "Offline" 
      });
    }
  })());
});
