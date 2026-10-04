// js/ui.js
import { t } from './i18n.js';

let audioCtx = null;
let currentCardState = null; // 快取卡片狀態 (支援語系動態熱重繪)
let flashTimer = null;

/**
 * 輔助防禦：智能解析 i18n Key 或保留已翻譯字串
 */
function resolveI18n(keyOrText) {
  if (!keyOrText) return "";
  const translated = t(keyOrText);
  // 若字典有對應翻譯則返回，否則返回原字串
  return translated !== keyOrText ? translated : keyOrText;
}

/**
 * 1. 顯式初始化 Web Audio Context (具備例外捕獲與狀態喚醒)
 */
export function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch (e) {
        console.warn("[Audio] AudioContext 創建失敗:", e);
        return null;
      }
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * 2. 現場聲學合成引擎 (不依賴任何外部音訊檔，毫秒級反饋)
 */
export function playFeedbackSound(type = 'success') {
  try {
    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'success') {
      // 成功：清脆雙音階 (1200Hz -> 1800Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'duplicate') {
      // 重複警報：雙低音脈衝 (400Hz)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(450, now + 0.1);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      // 錯誤/偽造：下墜低音 (300Hz -> 150Hz)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.warn("[Audio] Web Audio 播放受限:", e);
  }
}

/**
 * 3. 鏡頭外框 CSS 動畫閃爍 (重置強制 Reflow，保證連續掃描次次觸發)
 */
function flashCameraBorder(type = 'success') {
  const container = document.getElementById("reader-container") || document.getElementById("reader");
  if (!container) return;

  if (flashTimer !== null) {
    clearTimeout(flashTimer);
  }

  container.classList.remove("flash-border-success", "flash-border-duplicate", "flash-border-error");
  void container.offsetWidth; // 強制 Reflow 重啟 CSS 動畫

  const cls = type === 'duplicate' ? 'flash-border-duplicate' : 
              type === 'error' ? 'flash-border-error' : 'flash-border-success';
  container.classList.add(cls);

  flashTimer = setTimeout(() => {
    container.classList.remove(cls);
    flashTimer = null;
  }, 450);
}

/**
 * 4. 僅更新文字內容 (支援動態 i18n 多語系替換)
 */
function updateCardTextOnly(guest, isDuplicate) {
  const tableNo = String(guest.table || guest.tableNo || "--").trim();
  
  // 隱私最小化與多語系：末 4 碼呈現
  const rawPhone = String(guest.phone_suffix || guest.phone || "").trim();
  const phoneSuffix = rawPhone.length > 4 ? rawPhone.slice(-4) : rawPhone;
  const locationText = phoneSuffix ? `${t("phoneSuffix")}: ${phoneSuffix}` : "";

  // 1. 工作人員視角
  const staffNameEl = document.getElementById("staffGuestName");
  if (staffNameEl) {
    staffNameEl.textContent = (isDuplicate ? `⚠️ (${t("statusAlreadyChecked")}) ` : "✅ ") + (guest.name || "Guest");
  }
  const staffTableDigitEl = document.getElementById("staffTableDigit");
  if (staffTableDigitEl) staffTableDigitEl.textContent = tableNo;

  const staffTableUnitEl = document.getElementById("staffTableUnit");
  if (staffTableUnitEl) staffTableUnitEl.textContent = t("tableUnit");

  const staffHintEl = document.getElementById("staffLocationHint");
  if (staffHintEl) staffHintEl.textContent = locationText;

  // 2. 賓客視角 (180度翻轉面板)
  const guestTableDigitEl = document.getElementById("guestTableDigit");
  if (guestTableDigitEl) guestTableDigitEl.textContent = tableNo;

  const guestTableUnitEl = document.getElementById("guestTableUnit");
  if (guestTableUnitEl) guestTableUnitEl.textContent = t("guestTableUnit");

  const guestWelcomeEl = document.getElementById("guestWelcomeText");
  if (guestWelcomeEl) {
    guestWelcomeEl.textContent = isDuplicate ? t("statusAlreadyChecked") : t("welcome");
  }

  const guestHintEl = document.getElementById("guestLocationHint");
  if (guestHintEl) {
    guestHintEl.textContent = t("pleaseProceed");
  }
}

/**
 * 5. 掃描成功業務入口
 */
export function renderCardSuccess(guest, isDuplicate = false) {
  currentCardState = { type: 'success', guest, isDuplicate };

  playFeedbackSound(isDuplicate ? 'duplicate' : 'success');
  flashCameraBorder(isDuplicate ? 'duplicate' : 'success');

  if (navigator.vibrate) {
    try {
      navigator.vibrate(isDuplicate ? [80, 60, 80] : 60);
    } catch (_) {}
  }

  updateCardTextOnly(guest, isDuplicate);

  const card = document.getElementById("resultCard");
  if (card) {
    card.classList.remove("idle", "success", "duplicate", "error");
    card.classList.add("active", isDuplicate ? "duplicate" : "success");
  }
}

/**
 * 6. 掃描失敗業務入口 (傳入 i18n Key 或字串皆能防禦解析)
 */
export function renderCardError(titleKey, subtitleKey) {
  currentCardState = { type: 'error', titleKey, subtitleKey };

  playFeedbackSound('error');
  flashCameraBorder('error');

  if (navigator.vibrate) {
    try {
      navigator.vibrate([120, 80, 120]);
    } catch (_) {}
  }

  const titleText = resolveI18n(titleKey);
  const subtitleText = resolveI18n(subtitleKey);

  const staffNameEl = document.getElementById("staffGuestName");
  if (staffNameEl) staffNameEl.textContent = "❌ " + titleText;

  const staffTableDigitEl = document.getElementById("staffTableDigit");
  if (staffTableDigitEl) staffTableDigitEl.textContent = "!";

  const staffTableUnitEl = document.getElementById("staffTableUnit");
  if (staffTableUnitEl) staffTableUnitEl.textContent = "";

  const staffHintEl = document.getElementById("staffLocationHint");
  if (staffHintEl) staffHintEl.textContent = subtitleText;

  const guestWelcomeEl = document.getElementById("guestWelcomeText");
  if (guestWelcomeEl) guestWelcomeEl.textContent = t("gotoHelpDesk");

  const guestTableDigitEl = document.getElementById("guestTableDigit");
  if (guestTableDigitEl) guestTableDigitEl.textContent = "?";

  const guestTableUnitEl = document.getElementById("guestTableUnit");
  if (guestTableUnitEl) guestTableUnitEl.textContent = "";

  const guestHintEl = document.getElementById("guestLocationHint");
  if (guestHintEl) guestHintEl.textContent = subtitleText;

  const card = document.getElementById("resultCard");
  if (card) {
    card.classList.remove("idle", "success", "duplicate");
    card.classList.add("active", "error");
  }
}

/**
 * 7. 多語系切換監聽 (純字串重繪，維持視圖對稱)
 */
export function rerenderCardForLangChange() {
  const flipBtn = document.getElementById("flipViewBtn");
  if (flipBtn) {
    const isGuest = document.body.classList.contains("mode-guest-facing");
    flipBtn.textContent = isGuest ? t("btnFlipStaff") : t("btnFlipGuest");
  }

  if (!currentCardState) return;

  if (currentCardState.type === 'success') {
    updateCardTextOnly(currentCardState.guest, currentCardState.isDuplicate);
  } else if (currentCardState.type === 'error') {
    const titleText = resolveI18n(currentCardState.titleKey);
    const subtitleText = resolveI18n(currentCardState.subtitleKey);

    const staffNameEl = document.getElementById("staffGuestName");
    if (staffNameEl) staffNameEl.textContent = "❌ " + titleText;

    const staffTableDigitEl = document.getElementById("staffTableDigit");
    if (staffTableDigitEl) staffTableDigitEl.textContent = "!";
    
    const staffTableUnitEl = document.getElementById("staffTableUnit");
    if (staffTableUnitEl) staffTableUnitEl.textContent = "";

    const staffHintEl = document.getElementById("staffLocationHint");
    if (staffHintEl) staffHintEl.textContent = subtitleText;
    
    const guestWelcomeEl = document.getElementById("guestWelcomeText");
    if (guestWelcomeEl) guestWelcomeEl.textContent = t("gotoHelpDesk");

    const guestTableDigitEl = document.getElementById("guestTableDigit");
    if (guestTableDigitEl) guestTableDigitEl.textContent = "?";
    
    const guestTableUnitEl = document.getElementById("guestTableUnit");
    if (guestTableUnitEl) guestTableUnitEl.textContent = "";

    const guestHintEl = document.getElementById("guestLocationHint");
    if (guestHintEl) guestHintEl.textContent = subtitleText;
  }
}

window.addEventListener("scansign-lang-changed", rerenderCardForLangChange);

/**
 * 8. 視角翻轉按鈕綁定 (支援初次初始化)
 */
const flipBtn = document.getElementById("flipViewBtn");
if (flipBtn) {
  flipBtn.addEventListener("click", () => {
    const isGuest = document.body.classList.toggle("mode-guest-facing");
    flipBtn.textContent = isGuest ? t("btnFlipStaff") : t("btnFlipGuest");
  });
}

/**
 * 9. 安全匯出動作兩段式確認綁定 (具備例外捕獲與狀態復原)
 */
export function bindExportAction(exportFn) {
  const exportBtn = document.getElementById("exportSafeBtn");
  if (!exportBtn) return;

  let confirmTimer = null;
  let inConfirmState = false;

  exportBtn.addEventListener("click", async () => {
    if (!inConfirmState) {
      inConfirmState = true;
      exportBtn.textContent = t("btnExportConfirm");
      exportBtn.classList.add("btn-confirming");

      confirmTimer = setTimeout(() => {
        inConfirmState = false;
        exportBtn.textContent = t("btnExport");
        exportBtn.classList.remove("btn-confirming");
      }, 4000);
      return;
    }

    clearTimeout(confirmTimer);
    inConfirmState = false;
    exportBtn.textContent = t("btnExport");
    exportBtn.classList.remove("btn-confirming");

    try {
      await exportFn();
    } catch (err) {
      console.error("[Export] 匯出失敗:", err);
      alert(t("exportFailed") || "匯出失敗，請重試或聯絡技術支援");
      exportBtn.textContent = t("btnExport");
      exportBtn.classList.remove("btn-confirming");
    }
  });
}

/**
 * 10. 頁面卸載時安全關閉 AudioContext
 */
window.addEventListener("beforeunload", () => {
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }
});
