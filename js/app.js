// js/app.js
if (window.__FRAME_BLOCKED__) {
  throw new Error("[Security] Frame blocked. Core initialization aborted.");
}

import { t, toggleLang, applyTranslations } from './i18n.js';
import { verifySignature, decryptManifestWithPin } from './crypto.js';
import { 
  initStorage, 
  inMemoryScannedSet, 
  inMemoryLogs, 
  recordCheckIn, 
  updateLogVerifiedStatus, 
  drainPendingVerifications,
  logSecurityIncident,
  isIndexedDBAvailable,
  getPendingCheckinWrites,
  getPendingSecurityWrites,
  getCheckedInCount,
  getSecurityLogs
} from './storage.js';
import { safeStartCamera, bindVisibilityAutoRecover, enableScreenWakeLock } from './scanner.js';
import { renderCardSuccess, renderCardError, bindExportAction } from './ui.js';
import { initSearchIndex, handleSearchInput } from './search.js';

let manifest = null;
let currentDeviceId = "";
let isUnlocking = false;
let customManifestData = null;
let currentUploadedFileName = "";

// 1. 初始化多語系與彈窗綁定
applyTranslations();
document.getElementById("langToggleBtn").addEventListener("click", () => {
  toggleLang();
  updateFileTagText();
});

// 指引彈窗開關
const guideModal = document.getElementById("guideModal");
document.getElementById("openGuideBtn").addEventListener("click", () => {
  guideModal.classList.remove("hidden");
});
document.getElementById("closeGuideBtn").addEventListener("click", () => {
  guideModal.classList.add("hidden");
});

// 合規架構彈窗開關
const compModal = document.getElementById("complianceModal");
document.getElementById("openComplianceBtn").addEventListener("click", () => {
  compModal.classList.remove("hidden");
});
document.getElementById("closeComplianceBtn").addEventListener("click", () => {
  compModal.classList.add("hidden");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    if (!navigator.serviceWorker.controller) return;
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          const swBanner = document.getElementById("swUpdateNotice");
          if (swBanner) swBanner.classList.remove("hidden");
        }
      });
    });
  }).catch(console.warn);
}

// 📱 PWA 主畫面安裝引導
let deferredPrompt = null;
const installBtn = document.getElementById("installPwaBtn");
const iosGuide = document.getElementById("iosInstallGuide");
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

if (!isStandalone) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.classList.remove("hidden");
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        installBtn.classList.add("hidden");
      }
      deferredPrompt = null;
    });
  }

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIos && iosGuide) {
    iosGuide.classList.remove("hidden");
  }
}

// 📁 名冊來源切換與本地檔案讀取
const sourceSelect = document.getElementById("manifestSourceSelect");
const customContainer = document.getElementById("customManifestContainer");
const fileInput = document.getElementById("manifestFileInput");
const fileInfo = document.getElementById("manifestFileInfo");

function updateFileTagText() {
  if (!fileInfo) return;
  if (currentUploadedFileName) {
    fileInfo.textContent = `✅ ${t("manifestLoaded")} ${currentUploadedFileName}`;
  } else {
    fileInfo.textContent = t("manifestFileUnselected");
  }
}

if (sourceSelect) {
  sourceSelect.addEventListener("change", (e) => {
    if (e.target.value === "custom") {
      if (customContainer) customContainer.classList.remove("hidden");
    } else {
      if (customContainer) customContainer.classList.add("hidden");
      customManifestData = null;
      currentUploadedFileName = "";
      if (fileInput) fileInput.value = "";
      updateFileTagText();
    }
  });
}

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    currentUploadedFileName = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        customManifestData = JSON.parse(event.target.result);
        updateFileTagText();
        const pinError = document.getElementById("pinError");
        if (pinError) pinError.textContent = "";
      } catch (err) {
        customManifestData = null;
        currentUploadedFileName = "";
        fileInfo.textContent = t("manifestFileError");
      }
    };
    reader.readAsText(file);
  });
}

// 頂層單一註冊卸載阻斷
window.addEventListener("beforeunload", (e) => {
  const hasUnsavedCheckins = inMemoryLogs.length > 0 && 
    (!isIndexedDBAvailable || getPendingCheckinWrites() > 0);
  
  const hasUnsavedSecurity = getSecurityLogs().length > 0 && 
    (!isIndexedDBAvailable || getPendingSecurityWrites() > 0);

  if (hasUnsavedCheckins || hasUnsavedSecurity) {
    e.preventDefault();
    e.returnValue = t("warnUnsaved");
    return e.returnValue;
  }
});

// 2. PIN 解鎖與強制選取工位
const unlockBtn = document.getElementById("unlockBtn");
unlockBtn.addEventListener("click", async () => {
  if (isUnlocking) return;

  const pin = document.getElementById("pinInput").value.trim();
  const stationSelect = document.getElementById("initialDeviceSelect");
  const selectedSource = sourceSelect ? sourceSelect.value : "default";
  
  if (!stationSelect.value) {
    document.getElementById("pinError").textContent = t("stationRequired");
    stationSelect.focus();
    return;
  }

  if (selectedSource === "custom" && !customManifestData) {
    document.getElementById("pinError").textContent = t("manifestFileRequired");
    return;
  }
  
  currentDeviceId = stationSelect.value;
  document.getElementById("currentStationTag").textContent = currentDeviceId;

  if (!pin) return;

  isUnlocking = true;
  unlockBtn.disabled = true;

  try {
    await initStorage();

    let encData = null;
    if (selectedSource === "custom") {
      encData = customManifestData;
    } else {
      const res = await fetch("./data/manifest.enc.json");
      if (!res.ok) throw new Error("Manifest fetch failed");
      encData = await res.json();
    }

    manifest = await decryptManifestWithPin(encData, pin);
    initSearchIndex(manifest);

    document.getElementById("pinLockScreen").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");

    await enableScreenWakeLock();
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }

    updateTally();
    await safeStartCamera(onScan);
    bindVisibilityAutoRecover(onScan);

  } catch (err) {
    console.error(err);
    logSecurityIncident("DECRYPT_FAIL", { error: err.message, device_id: currentDeviceId || "UNSET" });
    document.getElementById("pinError").textContent = t("pinError");
  } finally {
    isUnlocking = false;
    unlockBtn.disabled = false;
  }
});

// 3. 掃描處理流程
async function onScan(decodedText) {
  if (!decodedText.startsWith("v1.")) {
    logSecurityIncident("INVALID_FORMAT", { raw: decodedText, device_id: currentDeviceId });
    renderCardError(t("verifyFail"), t("forgedTicket"));
    return;
  }

  const parts = decodedText.split(".");
  if (parts.length !== 3) {
    renderCardError(t("verifyFail"), t("forgedTicket"));
    return;
  }

  const [_, tid, sigHex] = parts;
  const guest = manifest[tid];

  if (!guest) {
    logSecurityIncident("NOT_FOUND", { tid, device_id: currentDeviceId });
    renderCardError(t("unknownTicket"), t("gotoHelpDesk"));
    return;
  }

  const isDuplicate = inMemoryScannedSet.has(tid);
  if (isDuplicate) {
    logSecurityIncident("DUPLICATE_ALERT", { tid, device_id: currentDeviceId });
  }

  renderCardSuccess(guest, isDuplicate);
  
  const logRef = recordCheckIn({
    tid,
    device_id: currentDeviceId,
    scanned_at: new Date().toISOString(),
    table_no: guest.table || "--",
    method: "scan",
    verified: "pending"
  });
  updateTally();

  verifySignature(tid, sigHex).then((isValid) => {
    if (!isValid) {
      updateLogVerifiedStatus(logRef, "invalid");
      logSecurityIncident("INVALID_SIG", { tid, device_id: currentDeviceId });
      renderCardError(t("verifyFail"), t("forgedTicket"));
    } else {
      updateLogVerifiedStatus(logRef, "valid");
    }
  });
}

// 4. 手動補登獨立通道
function handleManualCheckIn(tid) {
  const guest = manifest[tid];
  if (!guest) return;

  const isDuplicate = inMemoryScannedSet.has(tid);
  if (isDuplicate) {
    logSecurityIncident("DUPLICATE_ALERT", { tid, device_id: currentDeviceId, method: "manual" });
  }

  renderCardSuccess(guest, isDuplicate);
  recordCheckIn({
    tid,
    device_id: currentDeviceId,
    scanned_at: new Date().toISOString(),
    table_no: guest.table || "--",
    method: "manual",
    verified: "exempt"
  });
  updateTally();
}

function updateTally() {
  document.getElementById("scanCountDisplay").textContent = getCheckedInCount();
}

const manualInput = document.getElementById("manualInput");
manualInput.addEventListener("input", (e) => {
  const val = e.target.value;
  e.target.parentElement.classList.toggle("has-val", val.length > 0);
  handleSearchInput(val, handleManualCheckIn);
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
  manualInput.value = "";
  manualInput.parentElement.classList.remove("has-val");
  document.getElementById("searchResults").innerHTML = "";
});

// 5. 強化版 CSV 轉義
function csvEscape(value, isNumeric = false) {
  if (isNumeric && typeof value === "number") {
    return String(value);
  }
  const str = String(value ?? "");
  const dangerousPrefix = /^[=+\-@\t\r\n]/;
  const safeStr = dangerousPrefix.test(str) ? `'${str}` : str;
  return `"${safeStr.replace(/"/g, '""')}"`;
}

function truncateString(str, maxLen = 1000) {
  const s = String(str ?? "");
  return s.length > maxLen ? s.slice(0, maxLen) + "...[truncated]" : s;
}

// 6. 匯出邏輯
bindExportAction(async () => {
  if (inMemoryLogs.length === 0) {
    alert(t("alertNoData"));
    return;
  }

  const exportBtn = document.getElementById("exportSafeBtn");
  const originalText = exportBtn.textContent;
  
  exportBtn.textContent = t("exportWaiting");
  exportBtn.disabled = true;

  try {
    await drainPendingVerifications();

    const headers = [
      "tid",
      "scanned_at",
      "device_id",
      "table_no",
      "method",
      "verified(valid:OK|invalid:FAIL|exempt:MANUAL|pending:TIMEOUT)",
      "monotonic_seq"
    ];
    let csv = headers.join(",") + "\n";

    inMemoryLogs.forEach(r => {
      csv += [
        csvEscape(r.tid),
        csvEscape(r.scanned_at),
        csvEscape(r.device_id),
        csvEscape(r.table_no),
        csvEscape(r.method),
        csvEscape(r.verified),
        csvEscape(r.monotonic_seq, true)
      ].join(",") + "\n";
    });

    const timestamp = Date.now();
    const filename = `scansign_${currentDeviceId}_${timestamp}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const secLogs = getSecurityLogs();
    if (secLogs.length > 0) {
      const secHeaders = ["security_seq", "event_type", "recorded_at", "details"];
      let secCsv = secHeaders.join(",") + "\n";
      secLogs.forEach(s => {
        const detailJson = JSON.stringify(s.details);
        const safeDetails = truncateString(detailJson, 1000);
        secCsv += [
          csvEscape(s.security_seq, true),
          csvEscape(s.event_type),
          csvEscape(s.recorded_at),
          csvEscape(safeDetails)
        ].join(",") + "\n";
      });
      const secBlob = new Blob([secCsv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(secBlob, `scansign_${currentDeviceId}_security_${timestamp}.csv`);
    }

    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: "text/csv" })] })) {
      try {
        await navigator.share({
          files: [new File([blob], filename, { type: "text/csv" })],
          title: "ScanSign Export",
          text: `Check-in logs for ${currentDeviceId}`
        });
        return;
      } catch (e) {}
    }

    downloadBlob(blob, filename);

  } finally {
    exportBtn.textContent = originalText;
    exportBtn.disabled = false;
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
