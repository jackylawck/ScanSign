// js/scanner.js
let html5QrCode = null;
let cameraState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping' | 'error'
let resumeDebounceTimer = null;
let activeWakeLock = null;

let lastScanText = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 2000;

let visibilityBound = false;
let currentOnScanSuccess = null;

// 共享的 Promise 實例，確保啟動與停止串行化
let stopPromise = null;
let startPromise = null;

export async function enableScreenWakeLock() {
  if (activeWakeLock !== null) return;
  if (!('wakeLock' in navigator)) return;
  try {
    activeWakeLock = await navigator.wakeLock.request('screen');
    activeWakeLock.addEventListener('release', () => { activeWakeLock = null; });
  } catch (err) {
    console.warn("[Scanner] Wake Lock 申請受限:", err);
  }
}

/**
 * 徹底終結競態：支援在 stopping 狀態下自動排隊等待，杜絕切換 App 造成的相機死鎖
 */
export async function safeStartCamera(onScanSuccess) {
  // 1. 若正在啟動中，直接回傳正在進行的 Promise
  if (startPromise) return startPromise;

  // 2. 若已經在運行，直接完成
  if (cameraState === 'running') return Promise.resolve();

  // 3. 關鍵修復：若正在停止中，等待停止徹底完成後再接續啟動
  if (cameraState === 'stopping' && stopPromise) {
    try {
      await stopPromise;
    } catch (_) {}
  }

  cameraState = 'starting';

  startPromise = (async () => {
    const errNotice = document.getElementById("cameraFallbackNotice");
    if (errNotice) errNotice.classList.add("hidden");

    const readerElement = document.getElementById("reader");
    if (!readerElement) {
      cameraState = 'idle';
      startPromise = null;
      return;
    }

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    const qrboxSize = Math.min(250, Math.floor(window.innerWidth * 0.7));
    const config = {
      fps: 10,
      qrbox: { width: qrboxSize, height: qrboxSize },
      disableFlip: true
    };

    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          const now = Date.now();
          // 同一張票券防抖冷卻，不同票券立即放行
          if (decodedText === lastScanText && (now - lastScanTime < SCAN_COOLDOWN_MS)) {
            return;
          }
          
          lastScanText = decodedText;
          lastScanTime = now;

          if (typeof onScanSuccess === "function") {
            try {
              onScanSuccess(decodedText);
            } catch (e) {
              console.error("[Scanner] onScanSuccess 回調異常:", e);
            }
          }
        },
        () => {} // 忽略每幀未辨識到的無害空回調
      );
      cameraState = 'running';
    } catch (err) {
      console.error("[Scanner] 相機啟動異常:", err);
      cameraState = 'error';
      lastScanText = "";
      lastScanTime = 0;
      if (html5QrCode) {
        try {
          await html5QrCode.clear().catch(() => {});
        } catch (_) {}
        html5QrCode = null;
      }
      if (errNotice) errNotice.classList.remove("hidden");
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

/**
 * 安全釋放鏡頭與底層 MediaStream 軌道
 */
export function safeStopCamera() {
  if (stopPromise) return stopPromise;

  if (!html5QrCode && cameraState === 'idle') {
    return Promise.resolve();
  }

  cameraState = 'stopping';

  stopPromise = (async () => {
    try {
      // 若有尚未完成的啟動作業，先等待其結算
      if (startPromise) {
        await startPromise.catch(() => {});
      }

      if (html5QrCode) {
        // 防禦性檢查：僅在執行中狀態才呼叫 stop，避免 library 拋出 NotRunning 異常
        if (html5QrCode.isScanning) {
          await html5QrCode.stop().catch(() => {});
        }
        await html5QrCode.clear().catch(() => {});
      }
    } catch (e) {
      console.warn("[Scanner] 相機釋放過程非致命例外:", e);
    } finally {
      html5QrCode = null;
      cameraState = 'idle';
      stopPromise = null;
    }
  })();

  return stopPromise;
}

/**
 * 跨平台生命週期：切換應用或螢幕休眠時自動安全釋放，恢復時平滑重啟
 */
export function bindVisibilityAutoRecover(onScanSuccess) {
  currentOnScanSuccess = onScanSuccess;

  if (visibilityBound) return;
  visibilityBound = true;

  document.addEventListener('visibilitychange', () => {
    clearTimeout(resumeDebounceTimer);

    if (document.visibilityState === 'hidden') {
      safeStopCamera().catch(err => console.warn("[Scanner] 背景關閉相機警告:", err));
    } else if (document.visibilityState === 'visible') {
      resumeDebounceTimer = setTimeout(async () => {
        // 第一重校驗：防快速切換
        if (document.visibilityState !== 'visible') return;
        
        await safeStopCamera();
        
        // 第二重校驗：防非同步耗時期間使用者再次切出
        if (document.visibilityState !== 'visible') return;
        
        await safeStartCamera(currentOnScanSuccess);
        await enableScreenWakeLock();
      }, 350);
    }
  });
}
