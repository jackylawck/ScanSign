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
  clearCurrentSessionMemory,
  clearEntireDatabase // 核心導入：徹底清空本機磁碟與記憶體
} from './storage.js';
import { safeStartCamera, safeStopCamera, bindVisibilityAutoRecover, enableScreenWakeLock } from './scanner.js';
import { renderCardSuccess, renderCardError, bindExportAction } from './ui.js';
import { initSearchIndex, handleSearchInput } from './search.js';
import { 
  validatePin,
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
let lastExportedAt = null;

let generatedEncJson = null;
let generatedTicketsHtml = null;

// P2 優化：從 localStorage 讀取持久化名冊指紋，防範頁面重整後被重置為 null
let lastManifestSignature = localStorage.getItem("scansign_manifest_sig") || null;

function getManifestSignature(m) {
  if (!m || typeof m !== 'object') return "";
  const keys = Object.keys(m).filter(k => !k.startsWith("__")).sort();
  return JSON.stringify(keys);
}

/**
 * 0. 離線標準 QR Code 生成引擎 (原生點陣 Canvas -> PNG Data URL)
 * 解決 Safari 上 drawImage 繪製 SVG 的空白圖片 Bug，保證全平台 100% 相容
 */
function createStandardOfflineQrDataUri(payloadText) {
  if (typeof window.qrcode !== 'function') {
    throw new Error("QR Code 生成庫尚未就緒，請確認已載入 vendor/qrcode.min.js");
  }

  try {
    let qr;
    try {
      qr = window.qrcode(0, 'H');
    } catch (err) {
      if (err.message && (err.message.includes('RS') || err.message.includes('bad'))) {
        qr = window.qrcode(0, 2);
      } else {
        throw err;
      }
    }

    qr.addData(payloadText);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const cellSize = 5;
    const margin = 10;
    const size = moduleCount * cellSize + 2 * margin;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#0f172a';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(margin + c * cellSize, margin + r * cellSize, cellSize, cellSize);
        }
      }
    }

    return canvas.toDataURL('image/png');
  } catch (err) {
    throw new Error(`QR Code 生成失敗 (Payload 長度: ${payloadText.length}): ${err.message}`);
  }
}

// 1. 初始化多語系與彈窗綁定
applyTranslations();

const langToggleBtn = document.getElementById("langToggleBtn");
if (langToggleBtn) {
  langToggleBtn.addEventListener("click", () => {
    toggleLang();
    updateFileTagText();
  });
}

// 彈窗模組開關控制
const bindModal = (openId, closeId, modalId) => {
  const openBtn = document.getElementById(openId);
  const closeBtn = document.getElementById(closeId);
  const modal = document.getElementById(modalId);
  if (openBtn && modal) openBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  if (closeBtn && modal) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
};
bindModal("openGuideBtn", "closeGuideBtn", "guideModal");
bindModal("openComplianceBtn", "closeComplianceBtn", "complianceModal");
bindModal("openAdminBtn", "closeAdminBtn", "adminModal");

// 🔒 返回首頁 / 重新更換工位或鎖定 (保留 IndexedDB 落盤數據)
const lockScreenBtn = document.getElementById("lockScreenBtn");
if (lockScreenBtn) {
  lockScreenBtn.addEventListener("click", async () => {
    await safeStopCamera();
    clearCurrentSessionMemory();
    resetVerifyKey();
    
    manifest = null;
    customManifestData = null;
    currentUploadedFileName = "";
    lastExportedAt = null;

    const fileInput = document.getElementById("manifestFileInput");
    if (fileInput) fileInput.value = "";
    updateFileTagText();

    const scanCount = document.getElementById("scanCountDisplay");
    if (scanCount) scanCount.textContent = "0";

    const mainApp = document.getElementById("mainApp");
    const pinLockScreen = document.getElementById("pinLockScreen");
    const pinInput = document.getElementById("pinInput");
    if (mainApp) mainApp.classList.add("hidden");
    if (pinLockScreen) pinLockScreen.classList.remove("hidden");
    if (pinInput) pinInput.value = "";
  });
}

// 🧹 手動專用按鈕：一鍵重設/清空本機簽到記錄
const resetDataBtn = document.getElementById("resetDataBtn");
if (resetDataBtn) {
  resetDataBtn.addEventListener("click", async () => {
    const confirmed = window.confirm("⚠️️ 確定要清空本機的所有簽到記錄嗎？\n\n清空後簽到人數將歸零，此操作無法復原。");
    if (!confirmed) return;

    await clearEntireDatabase();
    updateTally();

    const manualInputEl = document.getElementById("manualInput");
    if (manualInputEl) {
      manualInputEl.value = "";
      manualInputEl.parentElement?.classList.remove("has-val");
    }
    const searchResults = document.getElementById("searchResults");
    if (searchResults) searchResults.innerHTML = "";

    const resultCard = document.getElementById("resultCard");
    if (resultCard) {
      resultCard.className = "result-card idle";
      const staffName = document.getElementById("staffGuestName");
      const staffTable = document.getElementById("staffTableDigit");
      if (staffName) staffName.textContent = t("idlePrompt");
      if (staffTable) staffTable.textContent = "--";
    }

    alert("✅ 本機簽到資料庫已徹底清空，人數已歸零！");
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
    const file = e.target.files?.[0];
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
      const guestListTextarea = document.getElementById("guestListTextarea");
      if (guestListTextarea) guestListTextarea.value = lines.join("\n");
    };
    reader.readAsText(file);
  });
}

// 🛠️ 主辦方前端自訂 PIN 與產票引擎
const startGenerateBtn = document.getElementById("startGenerateBtn");
if (startGenerateBtn) {
  startGenerateBtn.addEventListener("click", async () => {
    const pinEl = document.getElementById("adminPinInput");
    const rawListEl = document.getElementById("guestListTextarea");
    const progressText = document.getElementById("adminProgressText");
    const resultBox = document.getElementById("adminResultBox");

    const pin = pinEl ? pinEl.value.trim() : "";
    const rawList = rawListEl ? rawListEl.value.trim() : "";

    const pinValidation = validatePin(pin);
    if (!pinValidation.ok) {
      alert(`PIN 碼強度不足：${pinValidation.reason}`);
      return;
    }

    const guests = parseGuestListInput(rawList);
    if (guests.length === 0) {
      alert("名冊內容不能為空！");
      return;
    }

    if (progressText) {
      progressText.classList.remove("hidden");
      progressText.textContent = "⚡ 正在生成 ECDSA P-256 金鑰對與密碼學簽名...";
    }

    try {
      const keyPair = await generateSigningKeyPair();
      const manifestObj = {};
      const ticketCards = [];

      for (let i = 0; i < guests.length; i++) {
        const g = guests[i];
        const tid = `G${String(i + 1).padStart(4, '0')}`;
        const sigStr = await signToken(keyPair.privateKey, tid);
        const qrData = `v1.${tid}.${sigStr}`;
        
        const qrImgUrl = createStandardOfflineQrDataUri(qrData);

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
              <img src="${qrImgUrl}" alt="QR" id="qr-${tid}">
            </div>
            <div class="tid-tag">${tid} | 末4碼: ${g.phone}</div>
            <button class="save-btn" onclick="saveSingleTicket('${tid}', '${g.name}')">💾 下載票券 (發送用)</button>
          </div>
        `);
      }

      if (progressText) {
        progressText.textContent = `🔒 正在使用自訂 PIN 進行 PBKDF2 與 AES-256-GCM 加密...`;
      }
      const encryptedData = await encryptManifestWithCustomPin(manifestObj, pin, keyPair.publicKey);

      generatedEncJson = JSON.stringify(encryptedData, null, 2);
      
      generatedTicketsHtml = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
  <title>ScanSign 現場入場憑證發送平台</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: #fff; padding: 16px 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .ticket-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
    .ticket-card { border: 2px dashed #94a3b8; border-radius: 12px; padding: 16px; text-align: center; background: #fff; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; }
    h2 { margin: 0 0 6px 0; font-size: 20px; }
    .table-info { font-size: 16px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
    .qr-box img { width: 220px; height: 220px; display: block; margin: 0 auto; image-rendering: pixelated; }
    .tid-tag { font-size: 12px; color: #64748b; margin-top: 8px; }
    .save-btn { margin-top: 12px; width: 100%; padding: 8px 12px; background: #0f172a; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
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
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">共 ${guests.length} 位賓客。支援無網離線列印或個別儲存發送。</p>
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
      
      ctx.drawImage(img, 75, 125, 250, 250);

      const tagText = card.querySelector('.tid-tag').textContent;
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.fillText(tagText, 200, 430);
      const link = document.createElement('a');
      link.download = name + '_入場券.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  <\/script>
</body>
</html>`;

      if (progressText) progressText.textContent = `✅ 產票完成！共 ${guests.length} 位賓客。`;
      if (resultBox) resultBox.classList.remove("hidden");

    } catch (err) {
      console.error(err);
      alert("產票失敗: " + err.message);
    }
  });
}

// 下載按鈕監聽
const downloadManifestBtn = document.getElementById("downloadManifestBtn");
if (downloadManifestBtn) {
  downloadManifestBtn.addEventListener("click", () => {
    if (!generatedEncJson) return;
    const blob = new Blob([generatedEncJson], { type: "application/json" });
    downloadBlob(blob, "manifest.enc.json");
  });
}

const downloadTicketsHtmlBtn = document.getElementById("downloadTicketsHtmlBtn");
if (downloadTicketsHtmlBtn) {
  downloadTicketsHtmlBtn.addEventListener("click", () => {
    if (!generatedTicketsHtml) return;
    const blob = new Blob([generatedTicketsHtml], { type: "text/html;charset=utf-8;" });
    downloadBlob(blob, "tickets.html");
  });
}

// PWA 註冊與離線
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    if (!navigator.serviceWorker.controller) return;
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          const swBanner = document.getElementById("swUpdateNotice");
          if (swBanner) swBanner.classList.remove("hidden");
        }
      });
    });
  }).catch(console.warn);
}

// 名冊來源切換
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
    const file = e.target.files?.[0];
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
        if (fileInfo) fileInfo.textContent = t("manifestFileError");
      }
    };
    reader.readAsText(file);
  });
}

// 卸載防護
window.addEventListener("beforeunload", (e) => {
  const hasUnsavedCheckins = inMemoryLogs.length > 0 && 
    !lastExportedAt &&
    (!isIndexedDBAvailable || getPendingCheckinWrites() > 0);
  
  const hasUnsavedSecurity = getSecurityLogs().length > 0 && 
    !lastExportedAt &&
    (!isIndexedDBAvailable || getPendingSecurityWrites() > 0);

  if (hasUnsavedCheckins || hasUnsavedSecurity) {
    e.preventDefault();
    e.returnValue = t("warnUnsaved");
    return e.returnValue;
  }
});

// 2. PIN 解鎖與強制選取工位 (修復 P1/P2：名冊指紋持久化比對，換名冊才清空)
const unlockBtn = document.getElementById("unlockBtn");
if (unlockBtn) {
  unlockBtn.addEventListener("click", async () => {
    if (isUnlocking) return;

    const pinInput = document.getElementById("pinInput");
    const pin = pinInput ? pinInput.value.trim() : "";
    const stationSelect = document.getElementById("initialDeviceSelect");
    const selectedSource = sourceSelect ? sourceSelect.value : "default";
    const pinError = document.getElementById("pinError");
    
    if (!stationSelect || !stationSelect.value) {
      if (pinError) pinError.textContent = t("stationRequired");
      if (stationSelect) stationSelect.focus();
      return;
    }

    if (selectedSource === "custom" && !customManifestData) {
      if (pinError) pinError.textContent = t("manifestFileRequired");
      return;
    }
    
    currentDeviceId = stationSelect.value;
    const currentStationTag = document.getElementById("currentStationTag");
    if (currentStationTag) currentStationTag.textContent = currentDeviceId;

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

      // 🛡️ P1/P2 修復：localStorage 雙重持久化指紋比對
      const incomingSignature = getManifestSignature(manifest);
      if (lastManifestSignature === null) {
        lastManifestSignature = incomingSignature;
        localStorage.setItem("scansign_manifest_sig", incomingSignature);
      } else if (lastManifestSignature !== incomingSignature) {
        console.warn("[Storage] 偵測到名冊更換，自動重置舊簽到資料庫...");
        await clearEntireDatabase();
        lastManifestSignature = incomingSignature;
        localStorage.setItem("scansign_manifest_sig", incomingSignature);
      } else {
        console.log("[Storage] 名冊一致，平滑恢復現有簽到資料。");
      }

      updateTally();
      initSearchIndex(manifest);

      const pinLockScreen = document.getElementById("pinLockScreen");
      const mainApp = document.getElementById("mainApp");
      if (pinLockScreen) pinLockScreen.classList.add("hidden");
      if (mainApp) mainApp.classList.remove("hidden");

      await enableScreenWakeLock();
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {});
      }

      await safeStartCamera(onScan);
      bindVisibilityAutoRecover(onScan);

    } catch (err) {
      console.error(err);
      logSecurityIncident("DECRYPT_FAIL", { error: err.message, device_id: currentDeviceId || "UNSET" });
      if (pinError) pinError.textContent = t("pinError");
    } finally {
      isUnlocking = false;
      unlockBtn.disabled = false;
    }
  });
}

// 3. 掃描處理流程 (加入 DEBUG log 與 Schema 容錯)
function onScan(decodedText) {
  try {
    console.log("[DEBUG] QR 掃描觸發成功:", decodedText);

    if (!decodedText || typeof decodedText !== "string" || !decodedText.startsWith("v1.")) {
      logSecurityIncident("INVALID_FORMAT", { 
        raw: String(decodedText).slice(0, 150), 
        device_id: currentDeviceId 
      });
      renderCardError(t("verifyFail"), t("forgedTicket"));
      return;
    }

    const parts = decodedText.split(".");
    if (parts.length !== 3) {
      renderCardError(t("verifyFail"), t("forgedTicket"));
      return;
    }

    const [_, rawTid, sigStr] = parts;

    let matchedKey = null;
    let guest = null;
    if (manifest) {
      if (manifest[rawTid]) {
        matchedKey = rawTid;
        guest = manifest[rawTid];
      } else {
        const numericTid = rawTid.replace(/\D/g, '');
        if (numericTid && manifest[numericTid]) {
          matchedKey = numericTid;
          guest = manifest[numericTid];
        } else {
          const paddedTid = `G${numericTid.padStart(4, '0')}`;
          if (manifest[paddedTid]) {
            matchedKey = paddedTid;
            guest = manifest[paddedTid];
          }
        }
      }
    }

    if (!guest || !matchedKey) {
      logSecurityIncident("NOT_FOUND", { tid: String(rawTid).slice(0, 50), device_id: currentDeviceId });
      renderCardError(t("unknownTicket"), t("gotoHelpDesk"));
      return;
    }

    const isDuplicate = inMemoryScannedSet.has(matchedKey);
    if (isDuplicate) {
      logSecurityIncident("DUPLICATE_ALERT", { tid: matchedKey, device_id: currentDeviceId });
    }

    renderCardSuccess(guest, isDuplicate);
    
    const logRef = recordCheckIn({
      tid: matchedKey,
      device_id: currentDeviceId,
      scanned_at: new Date().toISOString(),
      table_no: guest.table || "--",
      name: guest.name || "Guest",
      method: "scan",
      verified: "pending"
    });
    
    lastExportedAt = null;
    updateTally();

    // 背景非同步密碼學驗簽
    verifySignature(rawTid, sigStr)
      .then((isValid) => {
        if (!isValid) {
          updateLogVerifiedStatus(logRef, "invalid");
          logSecurityIncident("INVALID_SIG", { tid: matchedKey, device_id: currentDeviceId });
          renderCardError(t("verifyFail"), `${t("forgedTicket")} (${matchedKey})`);
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
function handleManualCheckIn(searchTid) {
  let matchedKey = null;
  let guest = null;
  if (manifest) {
    if (manifest[searchTid]) {
      matchedKey = searchTid;
      guest = manifest[searchTid];
    } else {
      const numeric = searchTid.replace(/\D/g, '');
      if (numeric && manifest[numeric]) {
        matchedKey = numeric;
        guest = manifest[numeric];
      } else {
        const padded = `G${numeric.padStart(4, '0')}`;
        if (manifest[padded]) {
          matchedKey = padded;
          guest = manifest[padded];
        }
      }
    }
  }
  if (!guest || !matchedKey) return;

  const isDuplicate = inMemoryScannedSet.has(matchedKey);
  if (isDuplicate) {
    logSecurityIncident("DUPLICATE_ALERT", { tid: matchedKey, device_id: currentDeviceId, method: "manual" });
  }

  renderCardSuccess(guest, isDuplicate);
  recordCheckIn({
    tid: matchedKey,
    device_id: currentDeviceId,
    scanned_at: new Date().toISOString(),
    table_no: guest.table || "--",
    name: guest.name || "Guest",
    method: "manual",
    verified: "exempt"
  });
  lastExportedAt = null;
  updateTally();
}

function updateTally() {
  const tally = document.getElementById("scanCountDisplay");
  if (tally) tally.textContent = getCheckedInCount();
}

const manualInput = document.getElementById("manualInput");
if (manualInput) {
  manualInput.addEventListener("input", (e) => {
    const val = e.target.value;
    e.target.parentElement?.classList.toggle("has-val", val.length > 0);
    handleSearchInput(val, handleManualCheckIn);
  });

  manualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearchInput(manualInput.value, handleManualCheckIn);
    }
  });
}

const manualActionBtn = document.getElementById("manualSearchActionBtn");
if (manualActionBtn && manualInput) {
  manualActionBtn.addEventListener("click", () => {
    handleSearchInput(manualInput.value, handleManualCheckIn);
  });
}

const clearSearchBtn = document.getElementById("clearSearchBtn");
if (clearSearchBtn && manualInput) {
  clearSearchBtn.addEventListener("click", () => {
    manualInput.value = "";
    manualInput.parentElement?.classList.remove("has-val");
    const searchResults = document.getElementById("searchResults");
    if (searchResults) searchResults.innerHTML = "";
  });
}

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
  if (!exportBtn) return;
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
        lastExportedAt = new Date().toISOString();
        return;
      } catch (e) {}
    }

    downloadBlob(blob, filename);
    lastExportedAt = new Date().toISOString();

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
