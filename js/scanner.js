// js/scanner.js
let html5QrCode = null;
let cameraState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping' | 'error'
let resumeDebounceTimer = null;
let activeWakeLock = null;

let lastScanText = "";
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 1500; // 1.5 秒冷卻，平衡防重複秒刷與手抖重試體驗

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

    // 核心調校：取景框擴展至 300px / 80%，避免大尺寸或高密度 QR 碼邊界裁切
    const qrboxSize = Math.min(300, Math.floor(window.innerWidth * 0.8));
    const config = {
      fps: 15, // 核心調校：提升至 15fps，加速軟解與晃動時的影格捕捉
      qrbox: { width: qrboxSize, height: qrboxSize },
      aspectRatio: 1.0, // P2 修復：鎖定正方形視角，防止 Safari 長屏相機預覽拉伸變形
      disableFlip: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true // 啟用 iOS 17+ 原生硬體加速
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
        const isRunning = (typeof html5QrCode.isScanning === 'boolean')
          ? html5QrCode.isScanning
          : (html5QrCode.getState?.() === 2 || cameraState === 'stopping');

        if (isRunning) {
          await html5QrCode.stop().catch(() => {});
        }
        await html5QrCode.clear().catch(() => {});
      }

      // P1 核心修復：主動切斷 WebKit/Safari 原生 MediaStreamTracks，杜絕硬體佔用鎖死
      const videoEl = document.querySelector("#reader video");
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject;
        if (typeof stream.getTracks === 'function') {
          stream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (_) {}
          });
        }
        videoEl.srcObject = null;
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
