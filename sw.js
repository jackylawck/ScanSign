// sw.js
// 注意：v202610050930-93d26f8 與 {
  "index.html": "sha256-3mYqQ4RP9N6i8vkvQjbfdcmppMoetmkY7OvqWB12he4=",
  "manifest.webmanifest": "sha256-BMRcWXcgMdXApjfaa5qGjyq6LI6RvSCRAoZgzmfUj2c=",
  "css/style.css": "sha256-u2hAtPJX3E41+UQP/y48AtBfX1C3dvpB5wwnSPx08FE=",
  "js/app.js": "sha256-kwTouYZYFCuUd92af3TosYiOgJYVp13uBjqvTIw9srI=",
  "js/crypto.js": "sha256-8Id2Xvv9Cbo96ca1aLUx+atj0M63b/4Xwwy5N/wbSE8=",
  "js/scanner.js": "sha256-Nl7moExgyTNJ8r7AbsrMlZT9/YYDkB9qs0bTQcivgq0=",
  "js/ui.js": "sha256-7uJbo87PJ32T99T70l+wOXCqUswvYNw2Fi5aa/lsfK0=",
  "js/i18n.js": "sha256-ChNRzOHLfvNv5FBcfug90cGlvJlxC24PQ2beunRHDe8=",
  "js/admin.js": "sha256-R4V9NZ7JjHI9kn94hpQ2aA1RbYpnp4RDuW2ArtVG+UA=",
  "js/search.js": "sha256-eDq3a0cvc81PdZLPuhIG99DH5NUWJykDCRjzXhO9UO8=",
  "js/storage.js": "sha256-lhxwd+ezJKVQDbBcFIsxpiXwHUGVWVRSfJElxG9Qb1c=",
  "js/frame-guard.js": "sha256-/oszFOuTSHyV4fuBPfpeaLkAi65hrKWCGJLYVxi9Tyk=",
  "vendor/qrcode.min.js": "sha256-d6GOuQLhl3JnYX23EC+B1usNKANzvNut0BFpoygwksE=",
  "vendor/html5-qrcode.min.js": "sha256-mZISmh+5jk5UAJo5l8/32QizJMcQQg8C9ZkRzwPr53g=",
  "icons/ScanSign192icon.png": "sha256-9O5suNKloLWloyA8d4d2DQ8OvR0KhlawQo34TBMaE2U=",
  "icons/ScanSign512icon.png": "sha256-p758jmMXqqDvKNyGFG3uPu+Rl9HEMGjbLeOqShw6e7o="
} 會由 scripts/inject_sw_integrity.py 自動注入
const CACHE_NAME = "scansign-v3-v202610050930-93d26f8";

// 由 inject_sw_integrity.py 自動注入之 W3C SRI 完整性雜湊表
const RESOURCE_INTEGRITY = {
  "index.html": "sha256-3mYqQ4RP9N6i8vkvQjbfdcmppMoetmkY7OvqWB12he4=",
  "manifest.webmanifest": "sha256-BMRcWXcgMdXApjfaa5qGjyq6LI6RvSCRAoZgzmfUj2c=",
  "css/style.css": "sha256-u2hAtPJX3E41+UQP/y48AtBfX1C3dvpB5wwnSPx08FE=",
  "js/app.js": "sha256-kwTouYZYFCuUd92af3TosYiOgJYVp13uBjqvTIw9srI=",
  "js/crypto.js": "sha256-8Id2Xvv9Cbo96ca1aLUx+atj0M63b/4Xwwy5N/wbSE8=",
  "js/scanner.js": "sha256-Nl7moExgyTNJ8r7AbsrMlZT9/YYDkB9qs0bTQcivgq0=",
  "js/ui.js": "sha256-7uJbo87PJ32T99T70l+wOXCqUswvYNw2Fi5aa/lsfK0=",
  "js/i18n.js": "sha256-ChNRzOHLfvNv5FBcfug90cGlvJlxC24PQ2beunRHDe8=",
  "js/admin.js": "sha256-R4V9NZ7JjHI9kn94hpQ2aA1RbYpnp4RDuW2ArtVG+UA=",
  "js/search.js": "sha256-eDq3a0cvc81PdZLPuhIG99DH5NUWJykDCRjzXhO9UO8=",
  "js/storage.js": "sha256-lhxwd+ezJKVQDbBcFIsxpiXwHUGVWVRSfJElxG9Qb1c=",
  "js/frame-guard.js": "sha256-/oszFOuTSHyV4fuBPfpeaLkAi65hrKWCGJLYVxi9Tyk=",
  "vendor/qrcode.min.js": "sha256-d6GOuQLhl3JnYX23EC+B1usNKANzvNut0BFpoygwksE=",
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
  "js/storage.js",              // 核心保護：杜絕離線 import 模組中斷
  "js/frame-guard.js",
  "vendor/qrcode.min.js",       // 核心保護：杜絕離線產票失敗
  "vendor/html5-qrcode.min.js"
];

/**
 * 輔助工具：將 ArrayBuffer 轉為 Base64 字串 (採用 32KB 分塊拼接，兼顧效能與防爆棧)
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
 * 1. Install 階段：原生相對路徑解析、標頭淨化與雙重根路徑快取
 */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] 啟動預快取並執行 SRI 雜湊檢驗 (版本: ${CACHE_NAME})...`);

      for (const [relPath, expectedHash] of Object.entries(RESOURCE_INTEGRITY)) {
        const isCritical = CRITICAL_ASSETS.includes(relPath);

        try {
          const res = await fetch(relPath, { cache: "no-cache" });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          // 核心密碼學：計算 SHA-256 雜湊
          const buffer = await res.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", buffer);
          const actualHash = `sha256-${bufferToBase64(digest)}`;

          if (actualHash !== expectedHash) {
            console.error(`[SW SRI Mismatch] 資源完整性遭破壞或竄改: ${relPath}`);
            console.error(`預期: ${expectedHash} | 實際: ${actualHash}`);
            throw new Error(`SRI integrity mismatch for ${relPath}`);
          }

          // P3 修復：淨化 Headers，清除 Content-Encoding 防止 WebKit 二次解壓崩潰
          const cleanHeaders = new Headers(res.headers);
          cleanHeaders.delete("Content-Encoding");
          cleanHeaders.delete("Content-Length");
          cleanHeaders.set("Content-Length", buffer.byteLength.toString());

          const makeCachedResponse = () => new Response(buffer, {
            status: res.status,
            statusText: res.statusText,
            headers: cleanHeaders
          });

          await cache.put(new Request(relPath), makeCachedResponse());

          // 根路徑 "./" 雙重快取：確保首頁斷網時秒開
          if (relPath === "index.html") {
            await cache.put(new Request("./"), makeCachedResponse());
          }

        } catch (err) {
          if (isCritical) {
            console.error(`[SW Fatal] 關鍵資源預快取或 SRI 校驗失敗，中斷安裝: ${relPath}`, err);
            throw err;
          } else {
            console.warn(`[SW Warning] 非關鍵資源載入失敗，略過: ${relPath}`, err);
          }
        }
      }

      // 預快取預設加密名冊 (Demo)
      try {
        const res = await fetch("data/manifest.enc.json", { cache: "no-cache" });
        if (res.ok) {
          const manifestBuffer = await res.arrayBuffer();
          const manifestHeaders = new Headers(res.headers);
          manifestHeaders.delete("Content-Encoding");
          manifestHeaders.delete("Content-Length");
          manifestHeaders.set("Content-Length", manifestBuffer.byteLength.toString());

          await cache.put(new Request("data/manifest.enc.json"), new Response(manifestBuffer, {
            status: res.status,
            statusText: res.statusText,
            headers: manifestHeaders
          }));
        }
      } catch (err) {
        console.warn("[SW] data/manifest.enc.json 預載入受限 (可由現場手動上傳模式補足):", err);
      }
    }).then(() => {
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
 * 3. Fetch 階段：離線優先 (Cache-First) + 異常回退防護
 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  let requestUrl;
  try {
    requestUrl = new URL(e.request.url);
  } catch {
    return;
  }

  if (!requestUrl.protocol.startsWith("http")) return;

  e.respondWith((async () => {
    // 1. 優先匹配快取
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }

    // 2. 快取未命中時請求網路 (P2 修復：增加非 200 回退防護)
    try {
      const networkRes = await fetch(e.request);
      if (networkRes && networkRes.status === 200) {
        return networkRes;
      }

      // 若網路回傳 404/500，嘗試回退至快取
      const fallbackCached = await caches.match(e.request, { ignoreSearch: true });
      if (fallbackCached) return fallbackCached;

      return networkRes;
    } catch (err) {
      // 3. 斷網導航模式回退首頁
      if (e.request.mode === "navigate") {
        const fallbackIndex = (await caches.match("./", { ignoreSearch: true })) ||
                              (await caches.match("index.html", { ignoreSearch: true }));
        if (fallbackIndex) return fallbackIndex;
      }

      return new Response("Offline resource unavailable", { 
        status: 503, 
        statusText: "Offline" 
      });
    }
  })());
});
