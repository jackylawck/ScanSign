// js/i18n.js
export const DICTIONARY = {
  zh: {
    pinTitle: "請輸入工作 PIN 碼",
    pinDesc: "解密當日名冊並啟用驗票工作台",
    selectStation: "指定工位：",
    selectStationPrompt: "-- 請選擇工位 / Select Station --",
    stationRequired: "請先指定本機所屬工位！",
    selectManifestSource: "活動名冊來源：",
    manifestDefault: "示範名冊 (內建 Demo)",
    manifestCustom: "📁 自行載入名冊 (.enc.json)",
    uploadManifestLabel: "選擇加密名冊檔案：",
    manifestFileRequired: "請先選擇主辦方提供的 .enc.json 加密名冊檔案！",
    manifestFileUnselected: "尚未選擇檔案",
    manifestLoaded: "已載入檔案：",
    manifestFileError: "❌ 檔案格式錯誤，必須為合法的 JSON",
    unlockBtn: "解鎖系統",
    pinError: "PIN 碼錯誤或名冊毀損，無法解密！",
    ramModeNotice: "⚠️ 目前處於純記憶體模式，請勿重新整理頁面",
    swUpdateNotice: "📢 系統有新版本，請於活動結束後再行重新整理。",
    cameraFallbackNotice: "相機啟動受限，請使用下方手動補登",
    checkedInCount: "已簽到：",
    idlePrompt: "請出示入場 QR Code",
    tableUnit: "圍",
    guestTableUnit: "號桌",
    idleSub: "對準上方鏡頭",
    welcome: "歡迎蒞臨",
    pleaseProceed: "請入座",
    searchPlaceholder: "輸入姓名或電話後 4 碼補登...",
    btnLockStation: "🔒 鎖定 / 換名冊",
    btnFlipGuest: "🔄 翻轉卡片(給賓客看)",
    btnFlipStaff: "📱 切換為工作人員視角",
    btnExport: "📥 匯出資料",
    btnExportConfirm: "⚠️ 再點一次確認匯出 (3s)",
    btnCheckIn: "補登",
    statusPresent: "已出席",
    statusAbsent: "未報到",
    statusAlreadyChecked: "已報到",
    verifyFail: "驗簽失敗",
    forgedTicket: "偽造票券",
    unknownTicket: "查無此人",
    gotoHelpDesk: "請引導至異常台",
    alertNoData: "目前尚無簽到記錄！",
    warnUnsaved: "現場簽到資料尚未備份匯出，關閉或重新載入將導致資料遺失！確定要離開嗎？",
    exportWaiting: "正在完成背景非同步簽名校驗，請稍候...",
    installPwaBtn: "📲 加入手機主畫面 (安裝 App)",
    iosInstallGuide: "💡 iOS 用戶：請點擊 Safari 底部的「分享」圖示 ⎋，然後選擇「加入主畫面」以獲得全螢幕流暢體驗。",
    btnGuide: "📖 操作指南",
    btnCompliance: "🛡️ 合規與架構",
    btnAdmin: "🛠️ 產票與自訂PIN",
    btnDownloadTemplate: "📥 下載範本",
    btnImportFile: "📂 匯入檔案",
    adminTitle: "🛠️ 主辦方離線產票與自訂 PIN 系統",
    adminSetPinLabel: "1. 設定當日工作 PIN 碼 (4-8位數字)：",
    adminGuestListLabel: "2. 貼上名冊 (每行：姓名, 桌號, 電話後4碼)：",
    adminBtnGenerate: "🚀 密碼學加密並產生檔案",
    adminSuccessTip: "🎉 加密完成！名冊與票券已在本地生成，零上傳安全無虞。",
    adminBtnDownloadManifest: "📥 下載加密名冊 (manifest.enc.json)",
    adminBtnDownloadTickets: "🖨️ 下載可列印/發送票券 (tickets.html)",
    guideTitle: "一掃簽 ScanSign | 使用說明",
    guideStep1Title: "1. 示範體驗",
    guideStep1Desc: "名冊來源選擇「示範名冊 (內建 Demo)」，工位選擇「C1」，PIN 碼輸入「8899」即可解鎖測試。",
    guideStep2Title: "2. 正式活動 (主辦方)",
    guideStep2Desc: "點擊頂部「🛠️ 產票與自訂PIN」，可下載 Excel 範本或直接匯入名單，輸入自訂 PIN 碼後一鍵生成專屬 manifest.enc.json 及獨立票券。",
    guideStep3Title: "3. 現場離線驗票",
    guideStep3Desc: "現場工作人員選擇「📁 自行載入名冊」，上傳該檔案並輸入主辦方自訂的 PIN 碼即可啟動。設備可切換為飛行模式斷網運作。",
    guideStep4Title: "4. 去重與匯出",
    guideStep4Desc: "系統以 ECDSA P-256 毫秒級驗簽並標記重複票券。結束後點擊「匯出資料」即可下載 CSV 出缺席總表。",
    complianceTitle: "🛡️ 全球法規遵從與治理架構說明",
    compNonAiTitle: "🤖 人工智慧法規排除判定 (EU AI Act / ISO 42001 / CAC)",
    compNonAiDesc: "本系統架構屬純確定性演算法（Deterministic Algorithmic System），依賴 Web Crypto API 數學運算，完全不具備自主推論、訓練或預測模型，依法排除於 EU AI Act 第 3(1) 條、ISO/IEC 42001 (AIMS) 及國家網信辦演算法備案管轄範疇。",
    compPrivacyTitle: "🔒 資料隱私與安全實踐 (HK PDPO / GDPR / ISO 27001)",
    compPrivacyDesc: "落實預設隱私（Privacy by Design）：純端側解密，零伺服器外傳。符合香港個人資料（私隱）條例第 1 至 4 保障原則、歐盟 GDPR 第 25/32 條及 ISO/IEC 27001/27701 密碼學存取控制規範。",
    btnClose: "關閉",
    langName: "English"
  },
  en: {
    pinTitle: "Enter Station PIN",
    pinDesc: "Decrypt event roster & start scanner",
    selectStation: "Station:",
    selectStationPrompt: "-- Select Station --",
    stationRequired: "Please select a station first!",
    selectManifestSource: "Roster Source:",
    manifestDefault: "Demo Roster (Built-in)",
    manifestCustom: "📁 Load Custom Roster (.enc.json)",
    uploadManifestLabel: "Select Encrypted Roster File:",
    manifestFileRequired: "Please select an encrypted roster (.enc.json) file first!",
    manifestFileUnselected: "No file selected",
    manifestLoaded: "Loaded file: ",
    manifestFileError: "❌ Invalid format: must be valid JSON",
    unlockBtn: "Unlock Console",
    pinError: "Invalid PIN or corrupted manifest!",
    ramModeNotice: "⚠️ In-Memory Mode: Do not reload page",
    swUpdateNotice: "📢 System update available. Please refresh after event.",
    cameraFallbackNotice: "Camera unavailable, use manual search below",
    checkedInCount: "Checked-in: ",
    idlePrompt: "Please Show Your QR Code",
    tableUnit: "Tbl",
    guestTableUnit: "Table",
    idleSub: "Align with camera above",
    welcome: "Welcome",
    pleaseProceed: "Please proceed to your seat",
    searchPlaceholder: "Search name or last 4 phone digits...",
    btnLockStation: "🔒 Lock / Switch Roster",
    btnFlipGuest: "🔄 Flip View (Guest)",
    btnFlipStaff: "📱 Staff View",
    btnExport: "📥 Export CSV",
    btnExportConfirm: "⚠️ Click again to confirm (3s)",
    btnCheckIn: "Check-in",
    statusPresent: "Present",
    statusAbsent: "Absent",
    statusAlreadyChecked: "Checked-in",
    verifyFail: "Invalid Signature",
    forgedTicket: "Forged Ticket",
    unknownTicket: "Guest Not Found",
    gotoHelpDesk: "Direct to Help Desk",
    alertNoData: "No check-in logs found!",
    warnUnsaved: "Logs not exported. Reloading will lose unbacked data. Leave?",
    exportWaiting: "Finalizing background cryptographic checks, please wait...",
    installPwaBtn: "📲 Add to Home Screen (Install App)",
    iosInstallGuide: "💡 iOS: Tap Share ⎋ at bottom of Safari, then select 'Add to Home Screen' for full-screen experience.",
    btnGuide: "📖 User Guide",
    btnCompliance: "🛡️ Compliance",
    btnAdmin: "🛠️ Admin Ticket Gen",
    btnDownloadTemplate: "📥 Template",
    btnImportFile: "📂 Import File",
    adminTitle: "🛠️ Offline Ticket Generator & Custom PIN",
    adminSetPinLabel: "1. Set Station PIN (4-8 digits):",
    adminGuestListLabel: "2. Paste Roster (Name, Table, Last4Phone):",
    adminBtnGenerate: "🚀 Cryptographically Sign & Encrypt",
    adminSuccessTip: "🎉 Success! Roster and tickets created locally with Zero Data Leakage.",
    adminBtnDownloadManifest: "📥 Download Encrypted Roster (manifest.enc.json)",
    adminBtnDownloadTickets: "🖨️ Download Printable/Sendable Tickets (tickets.html)",
    guideTitle: "ScanSign | Quick User Guide",
    guideStep1Title: "1. Demo Experience",
    guideStep1Desc: "Select 'Demo Roster (Built-in)', Station 'C1', and enter PIN '8899' to launch the scanner.",
    guideStep2Title: "2. Real Event Setup",
    guideStep2Desc: "Click '🛠️ Admin Ticket Gen' on top. Download the template or import your roster, set your PIN, and instantly generate manifest.enc.json and printable tickets in browser.",
    guideStep3Title: "3. Air-Gapped Verification",
    guideStep3Desc: "Station staff choose '📁 Load Custom Roster', upload the file, and unlock with your custom PIN. Device can run in Airplane Mode.",
    guideStep4Title: "4. Deduplication & Export",
    guideStep4Desc: "Verifies ECDSA P-256 signatures in sub-milliseconds and flags duplicate scans. Click 'Export CSV' to retrieve audit logs.",
    complianceTitle: "🛡️ Regulatory Compliance & Governance",
    compNonAiTitle: "🤖 AI Regulatory Exemption (EU AI Act / ISO 42001 / CAC)",
    compNonAiDesc: "ScanSign is a strictly deterministic algorithmic system powered by standard Web Crypto API primitives. With zero autonomous inference, predictive models, or ML pipelines, it is formally out of scope of EU AI Act Art. 3(1), ISO/IEC 42001, and CAC algorithmic registries.",
    compPrivacyTitle: "🔒 Data Protection Alignment (HK PDPO / GDPR / ISO 27001)",
    compPrivacyDesc: "Engineered around Privacy by Design: in-memory zero-server execution. Fully aligned with HK PDPO DPP 1-4, GDPR Articles 25/32, and ISO/IEC 27001/27701 cryptographic controls.",
    btnClose: "Close",
    langName: "繁體中文"
  }
};

let currentLang = localStorage.getItem("scansign_lang") || "zh";

export function getLang() {
  return currentLang;
}

export function t(key) {
  return (DICTIONARY[currentLang] && DICTIONARY[currentLang][key]) || key;
}

export function setLang(lang) {
  currentLang = lang === "en" ? "en" : "zh";
  localStorage.setItem("scansign_lang", currentLang);
  document.documentElement.lang = currentLang === "en" ? "en" : "zh-HK";
  applyTranslations();
  window.dispatchEvent(new CustomEvent("scansign-lang-changed", { detail: { lang: currentLang } }));
}

export function toggleLang() {
  setLang(currentLang === "zh" ? "en" : "zh");
}

export function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (DICTIONARY[currentLang] && DICTIONARY[currentLang][k]) {
      el.textContent = DICTIONARY[currentLang][k];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const k = el.getAttribute("data-i18n-placeholder");
    if (DICTIONARY[currentLang] && DICTIONARY[currentLang][k]) {
      el.setAttribute("placeholder", DICTIONARY[currentLang][k]);
    }
  });

  const langBtn = document.getElementById("langToggleBtn");
  if (langBtn) {
    langBtn.textContent = DICTIONARY[currentLang].langName;
  }
}
