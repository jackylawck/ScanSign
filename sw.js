// sw.js
// v202610021000-dcc4105 與 {
  "./index.html": "sha256-Nkgu/hGB1RrKJgzus7JyLN2I4RRQu8LVG0IpM4az01o=",
  "./manifest.webmanifest": "sha256-l6KlKHODnUr2YzQdU64KunXMQMNdB5NW5BN1oI20ne4=",
  "./css/style.css": "sha256-ooSqdYAcVHSqSa9ngjwpz/ZDgTOfW8yakN8TAqerlJ8=",
  "./js/i18n.js": "sha256-iqAKipXYTXdFbehPYxPDjTGPc3e1GnAWwBjkM+ewxSI=",
  "./js/frame-guard.js": "sha256-VlZNfv+q6NXjaQbkrmhQGhLPt86QpC+54jcv4NOpUqk=",
  "./js/crypto.js": "sha256-w6H+MPP4HZntbJS6y8DNEImtcZP57d1DaX4d6ECSMhQ=",
  "./js/storage.js": "sha256-dGRUhEeF6MnhnYSixWs8B4QnzUT5LyBYWi+4LKOJeik=",
  "./js/scanner.js": "sha256-ojBNjg9nRXrt3enFzRwM2xVV+Z3+8jOb2Wyac+5Ge9Y=",
  "./js/ui.js": "sha256-KedvQ7Py51x1iyhZWCn2wIiyaqd/mYVlXVjUYoKgGjs=",
  "./js/search.js": "sha256-h5WXPaQ1MtE18D3vxaZJmEwQeWIjn8FmJu+vHJK4QvU=",
  "./js/admin.js": "sha256-oTpRsevlwkR9r2QpX4sW4HeoXC6/eo8W/aa8jeml0sw=",
  "./js/app.js": "sha256-RslXAf0MdgSY4yQJjjYrwSp/5BHm1lp85qrkZqAV/kY=",
  "./vendor/html5-qrcode.min.js": "sha256-mZISmh+5jk5UAJo5l8/32QizJMcQQg8C9ZkRzwPr53g="
} 會由 GitHub Actions 自動注入
const CACHE_NAME = "scansign-v3-v202610021000-dcc4105";

// 離線必備核心資源清單
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/frame-guard.js",
  "./js/i18n.js",
  "./js/crypto.js",
  "./js/storage.js",
  "./js/scanner.js",
  "./js/ui.js",
  "./js/search.js",
  "./js/admin.js",
  "./js/app.js",
  "./vendor/html5-qrcode.min.js",
  "./data/manifest.enc.json"
];

// 安裝階段：極速預快取，即便單一非必要檔案失敗也不阻斷整體安裝
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          const res = await fetch(asset, { cache: "no-cache" });
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch (err) {
          console.warn("[SW] 預快取跳過非必要資源:", asset, err);
        }
      }
    })
  );
  // 強制立即接管，跳過等待
  self.skipWaiting();
});

// 啟用階段：清除所有舊版本快取，釋放儲存空間
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log("[SW] 清除過期舊快取:", k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 擷取策略：網絡優先 (Network First)，連線時秒用最新代碼；離線 (Offline) 時自動切回快取
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        // 若伺服器回傳有效資源，動態更新至快取中
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone).catch(() => {});
          });
        }
        return networkRes;
      })
      .catch(async () => {
        // 斷網 / 飛航模式：從本地快取讀取
        const cachedRes = await caches.match(e.request, { ignoreSearch: true });
        if (cachedRes) {
          return cachedRes;
        }
        // 若為頁面跳轉且無快取，返回入口 index.html
        if (e.request.mode === "navigate") {
          const fallback = (await caches.match("./index.html")) || (await caches.match("index.html"));
          if (fallback) return fallback;
        }
        return new Response("Offline resource unavailable", { status: 503, statusText: "Offline" });
      })
  );
});
