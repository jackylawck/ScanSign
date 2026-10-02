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
import { 
  generateSigningKeyPair, 
  signToken, 
  encryptManifestWithCustomPin, 
  parseGuestListInput 
} from './admin.js';

let manifest = null;
let currentDeviceId = "";
let isUnlocking = false;
let customManifestData = null;
let currentUploadedFileName = "";

// 產票暫存物件
let generatedEncJson = null;
let generatedTicketsHtml = null;

// 1. 初始化多語系與彈窗綁定
applyTranslations();
document.getElementById("langToggleBtn").addEventListener("click", () => {
  toggleLang();
  updateFileTagText();
});

// 彈窗模組開關控制
const guideModal = document.getElementById("guideModal");
document.getElementById("openGuideBtn").addEventListener("click", () => guideModal.classList.remove("hidden"));
document.getElementById("closeGuideBtn").addEventListener("click", () => guideModal.classList.add("hidden"));

const compModal = document.getElementById("complianceModal");
document.getElementById("openComplianceBtn").addEventListener("click", () => compModal.classList.remove("hidden"));
document.getElementById("closeComplianceBtn").addEventListener("click", () => compModal.classList.add("hidden"));

const adminModal = document.getElementById("adminModal");
document.getElementById("openAdminBtn").addEventListener("click", () => adminModal.classList.remove("hidden"));
document.getElementById("closeAdminBtn").addEventListener("click", () => adminModal.classList.add("hidden"));

// 🛠️ 主辦方前端自訂 PIN 與產票引擎
document.getElementById("startGenerateBtn").addEventListener("click", async () => {
  const pin = document.getElementById("adminPinInput").value.trim();
  const rawList = document.getElementById("guestListTextarea").value.trim();
  const progressText = document.getElementById("adminProgressText");
  const resultBox = document.getElementById("adminResultBox");

  if (!pin || pin.length < 4) {
    alert("請設定至少 4 位數的工作 PIN 碼！");
    return;
  }

  const guests = parseGuestListInput(rawList);
  if (guests.length === 0) {
    alert("名冊內容不能為空！");
    return;
  }

  progressText.classList.remove("hidden");
  progressText.textContent = "⚡ 正在生成 ECDSA P-256 金鑰對與密碼學簽名...";

  try {
    const keyPair = await generateSigningKeyPair();
    const manifestObj = {};
    const ticketCards = [];

    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const tid = `G${String(i + 1).padStart(4, '0')}`;
      const sigHex = await signToken(keyPair.privateKey, tid);
      const qrData = `v1.${tid}.${sigHex}`;

      manifestObj[tid] = {
        name: g.name,
        table: g.table,
        phone_suffix: g.phone
      };

      // 產生純代碼 QR 票券卡片
      ticketCards.push(`
        <div class="ticket-card">
          <h2>${g.name}</h2>
          <div class="table-info">第 ${g.table} 桌 / 圍</div>
          <div class="qr-box">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}" alt="QR">
          </div>
          <div class="tid-tag">${tid} | 末4碼: ${g.phone}</div>
        </div>
      `);
    }

    progressText.textContent = `🔒 正在使用自訂 PIN (${pin}) 進行 PBKDF2 與 AES-256-GCM 加密...`;
    const encryptedData = await encryptManifestWithCustomPin(manifestObj, pin);

    generatedEncJson = JSON.stringify(encryptedData, null, 2);
    generatedTicketsHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>ScanSign 現場入場憑證列印表</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 20px; background: #fff; color: #000; }
          .ticket-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
          .ticket-card { border: 2px dashed #000; border-radius: 8px; padding: 14px; text-align: center; page-break-inside: avoid; }
          h2 { margin: 0 0 6px 0; font-size: 18px; }
          .table-info { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .tid-tag { font-size: 11px; color: #666; margin-top: 6px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; margin-bottom: 20px; cursor: pointer;">🖨️ 列印所有票券</button>
        <div class="ticket-grid">
          ${ticketCards.join('')}
        </div>
      </body>
      </html>
    `;

    progressText.textContent = `✅ 產票完成！共 ${guests.length} 位賓客。`;
    resultBox.classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert("產票失敗: " + err.message);
  }
});

// 下載加密名冊
document.getElementById("downloadManifestBtn").addEventListener("click", () => {
  if (!generatedEncJson) return;
  const blob = new Blob([generatedEncJson], { type: "application/json" });
  downloadBlob(blob, "manifest.enc.json");
});

// 下載可列印票券
document.getElementById("downloadTicketsHtmlBtn").addEventListener("click", () => {
  if (!generatedTicketsHtml) return;
  const blob = new Blob([generatedTicketsHtml], { type: "text/html;charset=utf-8;" });
  downloadBlob(blob, "tickets.html");
});

// PWA 註冊與離線
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

// 名冊檔案切換與上傳讀取
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

// 卸載防護
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
