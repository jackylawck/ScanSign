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

// 📥 下載標準 Excel/CSV 範本 (帶 UTF-8 BOM，Excel 雙擊開不會亂碼)
const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
if (downloadTemplateBtn) {
  downloadTemplateBtn.addEventListener("click", () => {
    const templateCsv = 
`姓名,桌號,電話後4碼
陳大文,1,9876
李小明,2,6543
張美麗,1,1234
王志強,3,5566
黃巧欣,2,8822`;

    const blob = new Blob(["\uFEFF" + templateCsv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "ScanSign_名冊範本.csv");
  });
}

// 📂 直接選擇 CSV/TXT 檔案自動填入文字框
const importRosterFileInput = document.getElementById("importRosterFileInput");
if (importRosterFileInput) {
  importRosterFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let content = event.target.result;
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0 && lines[0].includes("姓名")) {
        lines.shift();
      }
      document.getElementById("guestListTextarea").value = lines.join("\n");
    };
    reader.readAsText(file);
  });
}

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
      const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;

      manifestObj[tid] = {
        name: g.name,
        table: g.table,
        phone_suffix: g.phone
      };

      // 產生單張獨立卡片，支援「💾 下載個別圖片」方便 WhatsApp / Email 發送
      ticketCards.push(`
        <div class="ticket-card" id="card-${tid}">
          <h2>${g.name}</h2>
          <div class="table-info">第 ${g.table} 圍 / 桌</div>
          <div class="qr-box">
            <img src="${qrImgUrl}" alt="QR" crossOrigin="anonymous" id="qr-${tid}">
          </div>
          <div class="tid-tag">${tid} | 末4碼: ${g.phone}</div>
          <button class="save-btn" onclick="saveSingleTicket('${tid}', '${g.name}')">💾 下載圖檔 (發送用)</button>
        </div>
      `);
    }

    progressText.textContent = `🔒 正在使用自訂 PIN (${pin}) 進行 PBKDF2 與 AES-256-GCM 加密...`;
    const encryptedData = await encryptManifestWithCustomPin(manifestObj, pin);

    generatedEncJson = JSON.stringify(encryptedData, null, 2);
    
    // 生成包含單張下載、一鍵列印的完整票券平台 HTML
    generatedTicketsHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>ScanSign 現場入場憑證發送平台</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }
          .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: #fff; padding: 16px 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .ticket-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
          .ticket-card { border: 2px dashed #94a3b8; border-radius: 12px; padding: 16px; text-align: center; background: #fff; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
          h2 { margin: 0 0 6px 0; font-size: 20px; }
          .table-info { font-size: 16px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
          .qr-box img { width: 180px; height: 180px; display: block; margin: 0 auto; }
          .tid-tag { font-size: 12px; color: #64748b; margin-top: 8px; }
          .save-btn { margin-top: 12px; width: 100%; padding: 8px 12px; background: #0f172a; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
          .save-btn:hover { background: #2563eb; }
          @media print {
            .header-bar, .save-btn { display: none !important; }
            body { background: #fff; padding: 0; }
            .ticket-card { border: 1px solid #000; box-shadow: none; margin-bottom: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="header-bar">
          <div>
            <h1 style="margin: 0; font-size: 20px;">🎟️ ScanSign 賓客電子入場券清單</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">共 ${guests.length} 位賓客。點擊卡片下方按鈕即可下載獨立圖片，方便經 WhatsApp / 電郵發送；亦可點擊右上角列印紙本。</p>
          </div>
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 15px; font-weight: 700; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer;">🖨️ 列印全場紙本</button>
        </div>

        <div class="ticket-grid">
          ${ticketCards.join('')}
        </div>

        <script>
          function saveSingleTicket(tid, name) {
            const card = document.getElementById('card-' + tid);
            const img = document.getElementById('qr-' + tid);

            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 520;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 400, 520);
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 4;
            ctx.strokeRect(10, 10, 380, 500);

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 26px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(name, 200, 60);

            const tableText = card.querySelector('.table-info').textContent;
            ctx.fillStyle = '#2563eb';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(tableText, 200, 95);

            ctx.drawImage(img, 65, 120, 270, 270);

            const tagText = card.querySelector('.tid-tag').textContent;
            ctx.fillStyle = '#64748b';
            ctx.font = '14px sans-serif';
            ctx.fillText(tagText, 200, 430);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.fillText('入場請向工作人員出示此二維碼', 200, 470);

            const link = document.createElement('a');
            link.download = name + '_入場券.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
          }
        <\/script>
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

// 下載可列印/發送票券
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
