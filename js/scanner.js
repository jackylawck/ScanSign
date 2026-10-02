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

// 宣告共享的 Promise 實例，徹底消滅競態條件與並發衝突
let stopPromise = null;
let startPromise = null;

export async function enableScreenWakeLock() {
  if (activeWakeLock !== null) return;
  if (!('wakeLock' in navigator)) return;
  try {
    activeWakeLock = await navigator.wakeLock.request('screen');
    activeWakeLock.addEventListener('release', () => { activeWakeLock = null; });
  } catch (err) {
    console.warn("Wake Lock 申請受限:", err);
  }
}

export function safeStartCamera(onScanSuccess) {
  if (startPromise) return startPromise;
  if (cameraState === 'running') return Promise.resolve();
  if (cameraState === 'stopping') {
    return Promise.resolve();
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
          if (decodedText === lastScanText && (now - lastScanTime < SCAN_COOLDOWN_MS)) {
            return;
          }
          
          lastScanText = decodedText;
          lastScanTime = now;

          if (typeof onScanSuccess === "function") {
            try {
              onScanSuccess(decodedText);
            } catch (e) {
              console.error("onScanSuccess 回調執行異常:", e);
            }
          }
        },
        () => {}
      );
      cameraState = 'running';
    } catch (err) {
      console.error("相機啟動異常:", err);
      cameraState = 'error';
      lastScanText = "";
      lastScanTime = 0;
      if (html5QrCode) {
        try {
          await html5QrCode.clear().catch(() => {});
        } catch (e) {}
        html5QrCode = null;
      }
      if (errNotice) errNotice.classList.remove("hidden");
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export function safeStopCamera() {
  if (stopPromise) return stopPromise;

  if (!html5QrCode && cameraState === 'idle') {
    return Promise.resolve();
  }

  cameraState = 'stopping';

  stopPromise = (async () => {
    try {
      if (startPromise) {
        await startPromise.catch(() => {});
      }

      if (html5QrCode) {
        await html5QrCode.stop().catch(() => {});
        await html5QrCode.clear().catch(() => {});
      }
    } catch (e) {
      console.warn("相機停止過程非致命例外:", e);
    } finally {
      html5QrCode = null;
      cameraState = 'idle';
      stopPromise = null;
    }
  })();

  return stopPromise;
}

// 完美防禦級別的序列化生命週期管理 (加入 visibilityState 雙重校驗)
export function bindVisibilityAutoRecover(onScanSuccess) {
  currentOnScanSuccess = onScanSuccess;

  if (visibilityBound) return;
  visibilityBound = true;

  document.addEventListener('visibilitychange', () => {
    clearTimeout(resumeDebounceTimer);

    if (document.visibilityState === 'hidden') {
      safeStopCamera().catch(err => console.warn("背景停止相機異常:", err));
    } else if (document.visibilityState === 'visible') {
      resumeDebounceTimer = setTimeout(async () => {
        // 第一重防線：進入非同步回調時檢查
        if (document.visibilityState !== 'visible') return;
        
        await safeStopCamera();
        
        // 第二重防線：在耗時的 await 結束後再次檢查
        if (document.visibilityState !== 'visible') return;
        
        await safeStartCamera(currentOnScanSuccess);
        await enableScreenWakeLock();
      }, 350);
    }
  });
}
