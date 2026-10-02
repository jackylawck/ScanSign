// js/scanner.js
let html5QrCode = null;
let cameraState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping' | 'error'
let resumeDebounceTimer = null;
let activeWakeLock = null;

let lastScanText = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 1500;

let visibilityBound = false;
let currentOnScanSuccess = null;

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

export async function safeStartCamera(onScanSuccess) {
  if (cameraState === 'starting' || cameraState === 'running') return;
  cameraState = 'starting';

  const errNotice = document.getElementById("cameraFallbackNotice");
  if (errNotice) errNotice.classList.add("hidden");

  const readerElement = document.getElementById("reader");
  if (!readerElement) {
    cameraState = 'idle';
    return;
  }

  // 1. 純淨初始化，避免傳入多餘格式陣列引發型別錯誤
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  // 2. 自適應瞄準框（取短邊 70%，確保瞄準白框永遠存在）
  const qrboxFunction = function(viewfinderWidth, viewfinderHeight) {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const boxSize = Math.floor(minEdge * 0.7);
    return {
      width: Math.max(200, Math.min(boxSize, 280)),
      height: Math.max(200, Math.min(boxSize, 280))
    };
  };

  // 3. 專為 iOS Safari 簡化約束：使用純字串 facingMode，杜絕 OverconstrainedError
  const config = {
    fps: 10,
    qrbox: qrboxFunction,
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
            console.error("onScanSuccess 執行異常:", e);
          }
        }
      },
      () => {}
    );
    cameraState = 'running';
  } catch (err) {
    console.error("相機啟動異常:", err);
    cameraState = 'error';
    if (errNotice) errNotice.classList.remove("hidden");
  }
}

export async function safeStopCamera() {
  if (!html5QrCode || cameraState === 'stopping' || cameraState === 'idle') {
    cameraState = 'idle';
    return;
  }
  cameraState = 'stopping';
  try {
    await html5QrCode.stop().catch(() => {});
  } catch (e) {
    console.warn("相機停止非致命警告:", e);
  }
  try {
    await html5QrCode.clear().catch(() => {});
  } catch (e) {
    console.warn("相機清空非致命警告:", e);
  } finally {
    html5QrCode = null;
    cameraState = 'idle';
  }
}

export function bindVisibilityAutoRecover(onScanSuccess) {
  currentOnScanSuccess = onScanSuccess;

  if (visibilityBound) return;
  visibilityBound = true;

  document.addEventListener('visibilitychange', () => {
    clearTimeout(resumeDebounceTimer);

    if (document.visibilityState === 'hidden') {
      safeStopCamera();
    } else if (document.visibilityState === 'visible') {
      resumeDebounceTimer = setTimeout(async () => {
        await safeStartCamera(currentOnScanSuccess);
        await enableScreenWakeLock();
      }, 350);
    }
  });
}
