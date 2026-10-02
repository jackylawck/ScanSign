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

  // 🚀 全畫面無邊界極速解碼設定：
  // 1. 移除 qrbox 裁切限制，全視窗範圍內只要出現 QR Code 立即秒解
  // 2. 提升 fps 至 15，大幅增加抗反光、抗摩爾紋辨識成功率
  // 3. 啟用原生硬體加速 (BarcodeDetector)
  const config = {
    fps: 15,
    aspectRatio: 1.0,
    disableFlip: true,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
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
      () => {} // 忽略常態性無條碼幀錯誤
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
