// sw.js
// __CACHE_VERSION__ 與 __SW_RESOURCE_INTEGRITY_MAP__ 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-core-__CACHE_VERSION__";

const RESOURCE_INTEGRITY = __SW_RESOURCE_INTEGRITY_MAP__;

// 需額外快取的動態資料檔 (具 AES-GCM 保護，不納入靜態雜湊清單)
const EXTRA_ASSETS = [
  "./data/manifest.enc.json"
];

// 將 ArrayBuffer 轉換為 Base64 字串（符合 W3C SRI 標準）
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. 驗證並快取靜態原始碼資源 (強制 no-store 確保拿到最新發布版本校驗雜湊)
      const urls = Object.keys(RESOURCE_INTEGRITY);
      for (const url of urls) {
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`[Fetch Error] HTTP ${response.status} for ${url}`);
          }
          const buffer = await response.clone().arrayBuffer();
          const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
          const actualB64 = `sha256-${bufferToBase64(hashBuf)}`;

          if (actualB64 !== RESOURCE_INTEGRITY[url]) {
            throw new Error(`[Integrity Breach] 資源完整性校驗失敗: ${url} (預期: ${RESOURCE_INTEGRITY[url]}, 實際: ${actualB64})`);
          }
          await cache.put(url, response);
        } catch (err) {
          console.error(`[SW Install Failed] 無法快取關鍵資源: ${url}`, err);
          throw err; // 中斷安裝，防止不完整或被竄改的程式碼上線
        }
      }

      // 2. 快取加密名冊檔案，保障離線可用 (若客戶採用自帶名冊方案，fetch 失敗不阻斷安裝)
      for (const asset of EXTRA_ASSETS) {
        try {
          const res = await fetch(asset, { cache: "no-store" });
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch (err) {
          console.warn("[SW Info] 預設名冊無法快取 (可能為自訂名冊模式):", asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // 只攔截 GET 請求
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cachedRes) => {
      if (cachedRes) {
        return cachedRes;
      }

      return fetch(e.request).catch(async (fetchError) => {
        // 離線防護：如果是網頁導航跳轉 (Navigation Request) 且處於斷網狀態，退回快取的 index.html
        if (e.request.mode === "navigate") {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match("./index.html") || await cache.match("index.html");
          if (fallback) return fallback;
        }
        throw fetchError;
      });
    })
  );
});
