// js/scanner.js
let html5QrCode = null;
let cameraState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping' | 'error'
let resumeDebounceTimer = null;
let activeWakeLock = null;

let lastScanText = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 1500;

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

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  // 自適應掃描框尺寸，防止在小螢幕手機上溢出
  const qrboxFunction = function(viewfinderWidth, viewfinderHeight) {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const boxSize = Math.floor(minEdge * 0.7);
    return {
      width: Math.max(180, Math.min(boxSize, 260)),
      height: Math.max(180, Math.min(boxSize, 260))
    };
  };

  const config = {
    fps: 10,
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
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
          onScanSuccess(decodedText);
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

// 智慧生命週期管理：背景時自動釋放鏡頭省電，回到前景時自動喚醒重啟
export function bindVisibilityAutoRecover(onScanSuccess) {
  currentOnScanSuccess = onScanSuccess;

  if (visibilityBound) return;
  visibilityBound = true;

  document.addEventListener('visibilitychange', () => {
    clearTimeout(resumeDebounceTimer);

    if (document.visibilityState === 'hidden') {
      // 切換至背景/鎖定手機時，立即關閉相機以節省電力並釋放鏡頭硬體
      safeStopCamera();
    } else if (document.visibilityState === 'visible') {
      // 重新切回網頁時，防抖重啟相機並補回螢幕常亮常駐
      resumeDebounceTimer = setTimeout(async () => {
        await safeStartCamera(currentOnScanSuccess);
        await enableScreenWakeLock();
      }, 350);
    }
  });
}
