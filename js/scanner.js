// js/scanner.js
let html5QrCode = null;
let cameraState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping' | 'error'
let resumeDebounceTimer = null;
let activeWakeLock = null;

let lastScanText = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 2000;

// 單例監聽標誌與動態熱更新回調指標
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

  // 確保容器存在且就緒
  const readerElement = document.getElementById("reader");
  if (!readerElement) {
    cameraState = 'idle';
    return;
  }

  // 1. 強制鎖定只解 QR_CODE，並啟用原生 BarcodeDetector 硬體加速
  if (!html5QrCode) {
    const formats = window.Html5QrcodeSupportedFormats ? [window.Html5QrcodeSupportedFormats.QR_CODE] : undefined;
    html5QrCode = new Html5Qrcode("reader", {
      formatsToSupport: formats,
      verbose: false,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    });
  }

  // 2. 自適應瞄準框：佔畫面 80%，給予充分識別邊距
  const qrboxFunction = function(viewfinderWidth, viewfinderHeight) {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const boxSize = Math.floor(minEdge * 0.8);
    return {
      width: Math.max(220, Math.min(boxSize, 320)),
      height: Math.max(220, Math.min(boxSize, 320))
    };
  };

  const config = {
    fps: 15,
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
    disableFlip: true,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    },
    videoConstraints: {
      facingMode: "environment",
      focusMode: "continuous"
    }
  };

  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        const now = Date.now();
        // 關鍵修復：只有在冷卻時間未到時才阻斷；一旦超過冷卻時間，立即放行觸發
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
      () => {} // 忽略常態性無條碼幀
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

// 智慧生命週期管理：背景時自動釋放鏡頭省電，回到前景時自動喚醒重啟
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
