// sw.js
// __CACHE_VERSION__ 與 __SW_RESOURCE_INTEGRITY_MAP__ 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-core-__CACHE_VERSION__";

const RESOURCE_INTEGRITY = __SW_RESOURCE_INTEGRITY_MAP__;

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
