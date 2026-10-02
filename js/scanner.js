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

  // 1. 正確啟用原生 BarcodeDetector：直接傳入頂層布林值，嚴格匹配 vendor 源碼解析邏輯
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader", {
      useBarCodeDetectorIfSupported: true,
      verbose: false
    });
  }

  // 2. 自適應動態瞄準框 (佔可視範圍 70%)
  const qrboxFunction = function(viewfinderWidth, viewfinderHeight) {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const boxSize = Math.floor(minEdge * 0.7);
    return {
      width: Math.max(200, Math.min(boxSize, 300)),
      height: Math.max(200, Math.min(boxSize, 300))
    };
  };

  // 3. 移除強制 aspectRatio，避免 iOS Safari 像素拉伸變形；幀率調整為最穩定的 10 fps
  const config = {
    fps: 10,
    qrbox: qrboxFunction,
    disableFlip: true,
    videoConstraints: {
      facingMode: "environment"
    }
  };

  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        const now = Date.now();
        // 防抖冷卻：未達時間阻斷，超過時間立即放行
        if (decodedText === lastScanText) {
          if (now - lastScanTime < SCAN_COOLDOWN_MS) {
            return;
          }
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
      () => {} // 忽略常態性未偵測到條碼幀
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
