// js/i18n.js
export const DICTIONARY = {
  zh: {
    pinTitle: "請輸入工作 PIN 碼",
    pinDesc: "解密當日名冊並啟用驗票工作台",
    selectStation: "指定工位：",
    selectStationPrompt: "-- 請選擇工位 / Select Station --",
    stationRequired: "請先指定本機所屬工位！",
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
    btnFlipGuest: "🔄 翻轉卡片(給賓客看)",
    btnFlipStaff: "📱 切換為工作人員視角",
    btnExport: "📥 匯出資料",
    btnExportConfirm: "⚠️ 再點一次確認匯出 (3s)",
    btnCheckIn: "補登",
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
    langName: "English"
  },
  en: {
    pinTitle: "Enter Station PIN",
    pinDesc: "Decrypt event roster & start scanner",
    selectStation: "Station:",
    selectStationPrompt: "-- Select Station --",
    stationRequired: "Please select a station first!",
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
    btnFlipGuest: "🔄 Flip View (Guest)",
    btnFlipStaff: "📱 Staff View",
    btnExport: "📥 Export CSV",
    btnExportConfirm: "⚠️ Click again to confirm (3s)",
    btnCheckIn: "Check-in",
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
    langName: "繁體中文"
  }
};

let currentLang = localStorage.getItem("scansign_lang") || "zh";

export function getLang() {
  return currentLang;
}

export function t(key) {
  return DICTIONARY[currentLang][key] || key;
}

export function setLang(lang) {
  currentLang = lang === "en" ? "en" : "zh";
  localStorage.setItem("scansign_lang", currentLang);
  document.documentElement.lang = currentLang === "en" ? "en" : "zh-HK";
  applyTranslations();

  // イベント駆動でモジュール間の循環依存を回避
  window.dispatchEvent(new CustomEvent("scansign-lang-changed", { detail: { lang: currentLang } }));
}

export function toggleLang() {
  setLang(currentLang === "zh" ? "en" : "zh");
}

export function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (DICTIONARY[currentLang][k]) {
      el.textContent = DICTIONARY[currentLang][k];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const k = el.getAttribute("data-i18n-placeholder");
    if (DICTIONARY[currentLang][k]) {
      el.setAttribute("placeholder", DICTIONARY[currentLang][k]);
    }
  });

  const langBtn = document.getElementById("langToggleBtn");
  if (langBtn) {
    langBtn.textContent = DICTIONARY[currentLang].langName;
  }
}
