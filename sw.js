// sw.js
// v202610020631-cb95806 與 {
  "./index.html": "sha256-4d918f238011b75750b0f2114b2bc2ec408cc9c21c26d52fdf343a7819f254ab",
  "./manifest.webmanifest": "sha256-bde5c134cf3bf90cc30822033f345c928e8a964b44bfb9f9dd393e006027ccbe",
  "./css/style.css": "sha256-9e1223b4fa7e2cf467cd86297dff0a1b1cfb7f50d826821ff83155ce18c096d2",
  "./js/i18n.js": "sha256-2aa13b82ba69f484faaabe4517cef5d0739a2cf428a85481267c8ebb591cc812",
  "./js/frame-guard.js": "sha256-7d227b6b55526b09949b8929352c6ef4b4a577df57608fcec4dd9b9e141ca741",
  "./js/crypto.js": "sha256-ad1bdaca8c64b627ec32758dc83509ad222af9ab91f5f83668dc7e48deb2064f",
  "./js/storage.js": "sha256-2d17ea732f85b754712e961c1d6d88a7dc3b2526aae15e4d56f859484a64a9b7",
  "./js/scanner.js": "sha256-7078d11cf46a836761f5494eaddff0343c0c6d25aea4aaae5ffd35b904933c2a",
  "./js/ui.js": "sha256-e0f93dc813d81a6476e67770cf8768df404d5f490cb4146ca8ee3d866bc4e431",
  "./js/search.js": "sha256-d7c3d71dfad139221355c4c87899ae0606aa9aca00dd95c3946a4edbcee44976",
  "./js/app.js": "sha256-ee1715dab79fe3974c351dfa09d418251047d4d344d3f4e78a78c1ad64ce3921",
  "./vendor/html5-qrcode.min.js": "sha256-9992129a1fb98e4e54009a3997cff7d908b324c710420f02f59911cf03ebe778"
} 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-core-v202610020631-cb95806";

const RESOURCE_INTEGRITY = {
  "./index.html": "sha256-4d918f238011b75750b0f2114b2bc2ec408cc9c21c26d52fdf343a7819f254ab",
  "./manifest.webmanifest": "sha256-bde5c134cf3bf90cc30822033f345c928e8a964b44bfb9f9dd393e006027ccbe",
  "./css/style.css": "sha256-9e1223b4fa7e2cf467cd86297dff0a1b1cfb7f50d826821ff83155ce18c096d2",
  "./js/i18n.js": "sha256-2aa13b82ba69f484faaabe4517cef5d0739a2cf428a85481267c8ebb591cc812",
  "./js/frame-guard.js": "sha256-7d227b6b55526b09949b8929352c6ef4b4a577df57608fcec4dd9b9e141ca741",
  "./js/crypto.js": "sha256-ad1bdaca8c64b627ec32758dc83509ad222af9ab91f5f83668dc7e48deb2064f",
  "./js/storage.js": "sha256-2d17ea732f85b754712e961c1d6d88a7dc3b2526aae15e4d56f859484a64a9b7",
  "./js/scanner.js": "sha256-7078d11cf46a836761f5494eaddff0343c0c6d25aea4aaae5ffd35b904933c2a",
  "./js/ui.js": "sha256-e0f93dc813d81a6476e67770cf8768df404d5f490cb4146ca8ee3d866bc4e431",
  "./js/search.js": "sha256-d7c3d71dfad139221355c4c87899ae0606aa9aca00dd95c3946a4edbcee44976",
  "./js/app.js": "sha256-ee1715dab79fe3974c351dfa09d418251047d4d344d3f4e78a78c1ad64ce3921",
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
      // 1. 驗證並快取靜態原始碼資源
      const urls = Object.keys(RESOURCE_INTEGRITY);
      for (const url of urls) {
        const response = await fetch(url);
        const buffer = await response.clone().arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
        const actualHex = `sha256-${bufferToHex(hashBuf)}`;

        if (actualHex !== RESOURCE_INTEGRITY[url]) {
          throw new Error(`[Integrity Breach] Resource tampered: ${url}`);
        }
        await cache.put(url, response);
      }

      // 2. 快取加密名冊檔案，保障離線可用
      for (const asset of EXTRA_ASSETS) {
        try {
          const res = await fetch(asset);
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch (err) {
          console.warn("無法預先快取資產:", asset, err);
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
  e.respondWith(
    caches.match(e.request).then((cachedRes) => {
      return cachedRes || fetch(e.request);
    })
  );
});
