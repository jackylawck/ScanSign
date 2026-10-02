// sw.js
// v202610020720-18a2ebb 與 {
  "./index.html": "sha256-0aa9e6e8e420b6cd54325e880656a3500d40c8c72f0959bd3776bdcd6fe99d7e",
  "./manifest.webmanifest": "sha256-bde5c134cf3bf90cc30822033f345c928e8a964b44bfb9f9dd393e006027ccbe",
  "./css/style.css": "sha256-3fb93de5213005c160538d588ecccb5fb494e4ee1c8d4a43601b6e5c7aa36cc6",
  "./js/i18n.js": "sha256-72d4e75754c9aebd597a9fc2ba050a6be70400b710a6649d8fbef8a2a9af5e80",
  "./js/frame-guard.js": "sha256-7d227b6b55526b09949b8929352c6ef4b4a577df57608fcec4dd9b9e141ca741",
  "./js/crypto.js": "sha256-ad1bdaca8c64b627ec32758dc83509ad222af9ab91f5f83668dc7e48deb2064f",
  "./js/storage.js": "sha256-2d17ea732f85b754712e961c1d6d88a7dc3b2526aae15e4d56f859484a64a9b7",
  "./js/scanner.js": "sha256-7078d11cf46a836761f5494eaddff0343c0c6d25aea4aaae5ffd35b904933c2a",
  "./js/ui.js": "sha256-e0f93dc813d81a6476e67770cf8768df404d5f490cb4146ca8ee3d866bc4e431",
  "./js/search.js": "sha256-d7c3d71dfad139221355c4c87899ae0606aa9aca00dd95c3946a4edbcee44976",
  "./js/app.js": "sha256-81bf0a9fd473a22e9da778c2d416f0f565aa766a1c89affbe1d2a6f5c94f099c",
  "./vendor/html5-qrcode.min.js": "sha256-9992129a1fb98e4e54009a3997cff7d908b324c710420f02f59911cf03ebe778"
} 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-core-v202610020720-18a2ebb";

const RESOURCE_INTEGRITY = {
  "./index.html": "sha256-0aa9e6e8e420b6cd54325e880656a3500d40c8c72f0959bd3776bdcd6fe99d7e",
  "./manifest.webmanifest": "sha256-bde5c134cf3bf90cc30822033f345c928e8a964b44bfb9f9dd393e006027ccbe",
  "./css/style.css": "sha256-3fb93de5213005c160538d588ecccb5fb494e4ee1c8d4a43601b6e5c7aa36cc6",
  "./js/i18n.js": "sha256-72d4e75754c9aebd597a9fc2ba050a6be70400b710a6649d8fbef8a2a9af5e80",
  "./js/frame-guard.js": "sha256-7d227b6b55526b09949b8929352c6ef4b4a577df57608fcec4dd9b9e141ca741",
  "./js/crypto.js": "sha256-ad1bdaca8c64b627ec32758dc83509ad222af9ab91f5f83668dc7e48deb2064f",
  "./js/storage.js": "sha256-2d17ea732f85b754712e961c1d6d88a7dc3b2526aae15e4d56f859484a64a9b7",
  "./js/scanner.js": "sha256-7078d11cf46a836761f5494eaddff0343c0c6d25aea4aaae5ffd35b904933c2a",
  "./js/ui.js": "sha256-e0f93dc813d81a6476e67770cf8768df404d5f490cb4146ca8ee3d866bc4e431",
  "./js/search.js": "sha256-d7c3d71dfad139221355c4c87899ae0606aa9aca00dd95c3946a4edbcee44976",
  "./js/app.js": "sha256-81bf0a9fd473a22e9da778c2d416f0f565aa766a1c89affbe1d2a6f5c94f099c",
  "./vendor/html5-qrcode.min.js": "sha256-9992129a1fb98e4e54009a3997cff7d908b324c710420f02f59911cf03ebe778"
};

// 需額外快取的動態資料檔 (具 AES-GCM 保護，不納入靜態雜湊清單)
const EXTRA_ASSETS = [
  "./data/manifest.enc.json"
];

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
          const actualHex = `sha256-${bufferToHex(hashBuf)}`;

          if (actualHex !== RESOURCE_INTEGRITY[url]) {
            throw new Error(`[Integrity Breach] Resource tampered: ${url} (Expected: ${RESOURCE_INTEGRITY[url]}, Got: ${actualHex})`);
          }
          await cache.put(url, response);
        } catch (err) {
          console.error(`[SW Install Failed] 無法快取關鍵資源: ${url}`, err);
          throw err; // 中斷安裝，防止不完整或被竄改的程式碼上線
        }
      }

      // 2. 快取加密名冊檔案，保障離線可用 (若客戶採用自帶名冊方案 B，fetch 失敗不應阻斷核心安裝)
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
    caches.match(e.request).then((cachedRes) => {
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
