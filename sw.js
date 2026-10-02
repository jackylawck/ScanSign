// sw.js
// v202610020800-dcc883d 與 {
  "./index.html": "sha256-f763430f680fefb3f940d5ce8e7fb0fed59ca896870cb6c48779cadf82e01fa0",
  "./manifest.webmanifest": "sha256-bde5c134cf3bf90cc30822033f345c928e8a964b44bfb9f9dd393e006027ccbe",
  "./css/style.css": "sha256-4085add4d35621c4377ac07d3f58ab85ad29027c42129a1191ec66bb4cedb63d",
  "./js/i18n.js": "sha256-4c9fa5997ca081fab122609fac6f5e708763de9788302fd5412f0fe6e99bab7b",
  "./js/frame-guard.js": "sha256-56564d7effaae8d5e36906e4ae68501a12cfb7ce90a42fb9e2372fe0d3a952a9",
  "./js/crypto.js": "sha256-ec12eb2b6b1102687339943a4b8fb39d3df1986f21ed35753a73c6df70fed2b2",
  "./js/storage.js": "sha256-2d17ea732f85b754712e961c1d6d88a7dc3b2526aae15e4d56f859484a64a9b7",
  "./js/scanner.js": "sha256-616fee8e38401d41cc3ad9bd7fe21abcc358f48f9f150dc1204b49bda8110602",
  "./js/ui.js": "sha256-e0f93dc813d81a6476e67770cf8768df404d5f490cb4146ca8ee3d866bc4e431",
  "./js/search.js": "sha256-8795973da43532d135f03defc5a649984c107962239fc16626efaf1c92b842f5",
  "./js/app.js": "sha256-c8476297ef850519e7bef9b2644990aae01747496815091cc733a07b809e735c",
  "./vendor/html5-qrcode.min.js": "sha256-9992129a1fb98e4e54009a3997cff7d908b324c710420f02f59911cf03ebe778"
} 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-core-v202610020800-dcc883d";

const RESOURCE_INTEGRITY = {
  "./index.html": "sha256-f763430f680fefb3f940d5ce8e7fb0fed59ca896870cb6c48779cadf82e01fa0",
  "./manifest.webmanifest": "sha256-bde5c134cf3bf90cc30822033f345c928e8a964b44bfb9f9dd393e006027ccbe",
  "./css/style.css": "sha256-4085add4d35621c4377ac07d3f58ab85ad29027c42129a1191ec66bb4cedb63d",
  "./js/i18n.js": "sha256-4c9fa5997ca081fab122609fac6f5e708763de9788302fd5412f0fe6e99bab7b",
  "./js/frame-guard.js": "sha256-56564d7effaae8d5e36906e4ae68501a12cfb7ce90a42fb9e2372fe0d3a952a9",
  "./js/crypto.js": "sha256-ec12eb2b6b1102687339943a4b8fb39d3df1986f21ed35753a73c6df70fed2b2",
  "./js/storage.js": "sha256-2d17ea732f85b754712e961c1d6d88a7dc3b2526aae15e4d56f859484a64a9b7",
  "./js/scanner.js": "sha256-616fee8e38401d41cc3ad9bd7fe21abcc358f48f9f150dc1204b49bda8110602",
  "./js/ui.js": "sha256-e0f93dc813d81a6476e67770cf8768df404d5f490cb4146ca8ee3d866bc4e431",
  "./js/search.js": "sha256-8795973da43532d135f03defc5a649984c107962239fc16626efaf1c92b842f5",
  "./js/app.js": "sha256-c8476297ef850519e7bef9b2644990aae01747496815091cc733a07b809e735c",
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
