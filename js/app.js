// js/app.js
if (window.__FRAME_BLOCKED__) {
  throw new Error("[Security] Frame blocked. Core initialization aborted.");
}

import { t, toggleLang, applyTranslations } from './i18n.js';
import { verifySignature, decryptManifestWithPin, resetVerifyKey } from './crypto.js';
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
  getSecurityLogs,
  clearCurrentSessionMemory
} from './storage.js';
import { safeStartCamera, safeStopCamera, bindVisibilityAutoRecover, enableScreenWakeLock } from './scanner.js';
import { renderCardSuccess, renderCardError, bindExportAction, playFeedbackSound } from './ui.js';
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

// 🔒 返回首頁 / 重新更換工位或名冊 (徹底重設所有記憶體狀態)
const lockScreenBtn = document.getElementById("lockScreenBtn");
if (lockScreenBtn) {
  lockScreenBtn.addEventListener("click", async () => {
    await safeStopCamera();
    clearCurrentSessionMemory();
    resetVerifyKey();
    manifest = null;
    document.getElementById("scanCountDisplay").textContent = "0";
    document.getElementById("mainApp").classList.add("hidden");
    document.getElementById("pinLockScreen").classList.remove("hidden");
    document.getElementById("pinInput").value = "";
  });
}

// 📥 下載名冊範本 (.xls 格式)
const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
if (downloadTemplateBtn) {
  downloadTemplateBtn.addEventListener("click", () => {
    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>名冊範本</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body>
        <table border="1">
          <tr><th>姓名</th><th>桌號</th><th>電話後4碼</th></tr>
          <tr><td>陳大文</td><td>1</td><td>9876</td></tr>
          <tr><td>李小明</td><td>2</td><td>6543</td></tr>
          <tr><td>張美麗</td><td>1</td><td>1234</td></tr>
          <tr><td>王志強</td><td>3</td><td>5566</td></tr>
          <tr><td>黃巧欣</td><td>2</td><td>8822</td></tr>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob([excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    downloadBlob(blob, "ScanSign_名冊範本.xls");
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
      const sigStr = await signToken(keyPair.privateKey, tid);
      const qrData = `v1.${tid}.${sigStr}`;
      const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

      manifestObj[tid] = {
        name: g.name,
        table: g.table,
        phone_suffix: g.phone
      };

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
    const encryptedData = await encryptManifestWithCustomPin(manifestObj, pin, keyPair.publicKey);

    generatedEncJson = JSON.stringify(encryptedData, null, 2);
    
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

// 3. 掃描處理流程 (支援容錯尋找名冊鍵值，杜絕因格式前綴不符引發的靜默失敗)
function onScan(decodedText) {
  try {
    if (!decodedText || typeof decodedText !== "string" || !decodedText.startsWith("v1.")) {
      logSecurityIncident("INVALID_FORMAT", { raw: String(decodedText), device_id: currentDeviceId });
      renderCardError(t("verifyFail"), t("forgedTicket"));
      return;
    }

    const parts = decodedText.split(".");
    if (parts.length !== 3) {
      renderCardError(t("verifyFail"), t("forgedTicket"));
      return;
    }

    const [_, tid, sigStr] = parts;

    // 關鍵修復：雙向匹配名冊鍵值 (相容 "G0005" 與 "5" 兩種命名格式)
    let guest = null;
    if (manifest) {
      if (manifest[tid]) {
        guest = manifest[tid];
      } else {
        const numericTid = tid.replace(/\D/g, '');
        if (numericTid && manifest[numericTid]) {
          guest = manifest[numericTid];
        } else {
          const paddedTid = `G${numericTid.padStart(4, '0')}`;
          if (manifest[paddedTid]) {
            guest = manifest[paddedTid];
          }
        }
      }
    }

    if (!guest) {
      logSecurityIncident("NOT_FOUND", { tid, device_id: currentDeviceId });
      renderCardError(t("unknownTicket"), t("gotoHelpDesk"));
      return;
    }

    const isDuplicate = inMemoryScannedSet.has(tid);
    if (isDuplicate) {
      logSecurityIncident("DUPLICATE_ALERT", { tid, device_id: currentDeviceId });
    }

    // 立即秒級反應：音效、視覺卡片更新
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

    // 背景非同步驗簽，完整捕獲防拋錯
    verifySignature(tid, sigStr)
      .then((isValid) => {
        if (!isValid) {
          updateLogVerifiedStatus(logRef, "invalid");
          logSecurityIncident("INVALID_SIG", { tid, device_id: currentDeviceId });
          renderCardError(t("verifyFail"), t("forgedTicket"));
        } else {
          updateLogVerifiedStatus(logRef, "valid");
        }
      })
      .catch((err) => {
        console.warn("[Verify Warning] 非同步驗簽例外:", err);
        updateLogVerifiedStatus(logRef, "exempt");
      });
  } catch (syncErr) {
    console.error("[Scan Error] onScan 執行異常:", syncErr);
  }
}

// 4. 手動補登獨立通道
function handleManualCheckIn(tid) {
  let guest = null;
  if (manifest) {
    guest = manifest[tid] || manifest[tid.replace(/\D/g, '')];
  }
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

// ⌨️ 手動補登按鈕與 Enter 鍵送出監聽
const manualActionBtn = document.getElementById("manualSearchActionBtn");
if (manualActionBtn) {
  manualActionBtn.addEventListener("click", () => {
    handleSearchInput(manualInput.value, handleManualCheckIn);
  });
}

manualInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSearchInput(manualInput.value, handleManualCheckIn);
  }
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

// 6. 匯出邏輯 (整合全場名冊)
bindExportAction(async () => {
  const exportBtn = document.getElementById("exportSafeBtn");
  const originalText = exportBtn.textContent;
  
  exportBtn.textContent = t("exportWaiting");
  exportBtn.disabled = true;

  try {
    await drainPendingVerifications();

    const scanLogMap = new Map();
    inMemoryLogs.forEach(log => {
      if (!scanLogMap.has(log.tid)) {
        scanLogMap.set(log.tid, log);
      }
    });

    const allGuests = Object.entries(manifest || {})
      .filter(([k]) => !k.startsWith("__"))
      .map(([tid, info]) => ({
        tid,
        name: info.name || "貴賓",
        table: info.table || "--",
        phone: info.phone_suffix || info.phone || "--"
      }));

    const headers = [
      "出席狀態",
      "姓名",
      "桌號/圍號",
      "電話後4碼",
      "票券編號(TID)",
      "簽到時間",
      "簽到方式",
      "處理工位"
    ];
    let csv = "\uFEFF" + headers.join(",") + "\n";

    allGuests.forEach(g => {
      const log = scanLogMap.get(g.tid);
      const isPresent = Boolean(log);

      csv += [
        csvEscape(isPresent ? "已出席" : "未報到"),
        csvEscape(g.name),
        csvEscape(g.table),
        csvEscape(g.phone),
        csvEscape(g.tid),
        csvEscape(isPresent ? log.scanned_at : "--"),
        csvEscape(isPresent ? (log.method === "scan" ? "掃碼" : "手動補登") : "--"),
        csvEscape(isPresent ? log.device_id : "--")
      ].join(",") + "\n";
    });

    const timestamp = Date.now();
    const filename = `ScanSign_全場賓客出缺席總表_${currentDeviceId}_${timestamp}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const secLogs = getSecurityLogs();
    if (secLogs.length > 0) {
      const secHeaders = ["security_seq", "event_type", "recorded_at", "details"];
      let secCsv = "\uFEFF" + secHeaders.join(",") + "\n";
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
      downloadBlob(secBlob, `ScanSign_資安稽核日誌_${currentDeviceId}_${timestamp}.csv`);
    }

    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: "text/csv" })] })) {
      try {
        await navigator.share({
          files: [new File([blob], filename, { type: "text/csv" })],
          title: "ScanSign 賓客出缺席總表",
          text: `出缺席記錄匯出 - ${currentDeviceId}`
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
