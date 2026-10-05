// js/scanner.js
let html5QrCode = null;
let cameraState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping' | 'error'
let resumeDebounceTimer = null;
let activeWakeLock = null;

let lastScanText = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 1500; // 優化 4.1：微調為 1.5 秒，提升現場重掃流暢度

let visibilityBound = false;
let currentOnScanSuccess = null;

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

export async function safeStartCamera(onScanSuccess) {
  if (startPromise) return startPromise;
  if (cameraState === 'running') return Promise.resolve();

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
      disableFlip: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true // 啟用 iOS 原生 BarcodeDetector 硬體加速
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
            try {
              onScanSuccess(decodedText);
            } catch (e) {
              console.error("[Scanner] onScanSuccess 回調異常:", e);
            }
          }
        },
        () => {}
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
        // 優化 4.2：多重守衛判定，防止舊版庫 isScanning 為 undefined 導致略過 stop()
        const isRunning = (typeof html5QrCode.isScanning === 'boolean')
          ? html5QrCode.isScanning
          : (html5QrCode.getState?.() === 2 || cameraState === 'stopping');

        if (isRunning) {
          await html5QrCode.stop().catch(() => {});
        }
        await html5QrCode.clear().catch(() => {});
      }
    } catch (e) {
      console.warn("[Scanner] 相機釋放非致命例外:", e);
    } finally {
      html5QrCode = null;
      cameraState = 'idle';
      stopPromise = null;
    }
  })();

  return stopPromise;
}

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
        if (document.visibilityState !== 'visible') return;
        await safeStopCamera();
        if (document.visibilityState !== 'visible') return;
        await safeStartCamera(currentOnScanSuccess);
        await enableScreenWakeLock();
      }, 350);
    }
  });
}
