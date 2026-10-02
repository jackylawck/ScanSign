// js/ui.js
import { t } from './i18n.js';

const card = document.getElementById("resultCard");
let currentCardState = null;

// 🔊 純前端 Web Audio API 合成音效引擎 (零外部檔案依賴，100% 離線合規)
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * 發出即時回饋提示音
 * @param {'success' | 'duplicate' | 'error'} type 
 */
export function playFeedbackSound(type = 'success') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'success') {
      // 🟢 成功：清脆雙頻高音「嗶！」 (880Hz -> 1760Hz 快速滑音)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'duplicate') {
      // 🟡 重複：雙中音警示 (587Hz 兩下嘟嘟聲)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      // 🔴 錯誤：低沉長音 (220Hz 沉悶警報)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    console.warn("音效播放非致命警告:", e);
  }
}

/**
 * 閃爍相機中央的四隻瞄準框角（綠色 / 黃色 / 紅色）
 */
function flashCameraBorder(color = '#22c55e') {
  const shaders = document.querySelectorAll('#qr-shaded-region div');
  if (!shaders || shaders.length === 0) return;

  shaders.forEach(el => {
    el.style.backgroundColor = color;
  });

  setTimeout(() => {
    shaders.forEach(el => {
      el.style.backgroundColor = '#ffffff';
    });
  }, 350);
}

card.addEventListener("animationend", (e) => {
  if (e.animationName === "cardGreenFlash") {
    card.classList.remove("flash-active");
  }
});

export function triggerCardAnimation(cardEl, baseClass) {
  cardEl.className = baseClass;
  void cardEl.offsetWidth;
  cardEl.classList.add("flash-active");
}

export function renderCardSuccess(guest, isDuplicate) {
  currentCardState = { type: 'success', guest, isDuplicate };
  
  // 1. 播放對應聲音回饋 (成功: 高音嗶 / 重複: 警示音)
  playFeedbackSound(isDuplicate ? 'duplicate' : 'success');

  // 2. 瞄準框四角瞬間閃爍 (成功: 螢光綠 / 重複: 黃色)
  flashCameraBorder(isDuplicate ? '#facc15' : '#22c55e');

  // 3. 完整保留桌號
  const tableNo = String(guest.table || guest.tableNo || "--").trim();
  const phoneSuffix = guest.phone_suffix || guest.phone || "";
  const locationText = phoneSuffix ? `末 4 碼: ${phoneSuffix}` : "";

  // 工作人員端視角
  document.getElementById("staffGuestName").textContent = (isDuplicate ? `⚠️ (${t("statusAlreadyChecked")}) ` : "✅ ") + (guest.name || "Guest");
  document.getElementById("staffTableDigit").textContent = tableNo;
  document.getElementById("staffTableUnit").textContent = t("tableUnit");
  document.getElementById("staffLocationHint").textContent = locationText;

  // 賓客端視角 (180度翻轉)
  document.getElementById("guestTableDigit").textContent = tableNo;
  document.getElementById("guestTableUnit").textContent = t("guestTableUnit");
  document.getElementById("guestWelcomeText").textContent = isDuplicate ? t("statusAlreadyChecked") : t("welcome");
  document.getElementById("guestLocationHint").textContent = locationText ? t("pleaseProceed") : "";

  // 4. 卡片視覺高亮動畫
  triggerCardAnimation(card, isDuplicate ? "result-card duplicate" : "result-card success");

  // 5. Android 設備輔助震動
  if (navigator.vibrate) {
    navigator.vibrate(isDuplicate ? [80, 60, 80] : 60);
  }
}

export function renderCardError(title, subtitle) {
  currentCardState = { type: 'error', title, subtitle };

  // 播放錯誤音並將瞄準框閃爍為紅色
  playFeedbackSound('error');
  flashCameraBorder('#dc2626');

  document.getElementById("staffGuestName").textContent = "❌ " + title;
  document.getElementById("staffTableDigit").textContent = "--";
  document.getElementById("staffTableUnit").textContent = "";
  document.getElementById("staffLocationHint").textContent = subtitle;

  document.getElementById("guestTableDigit").textContent = "--";
  document.getElementById("guestTableUnit").textContent = "";
  document.getElementById("guestWelcomeText").textContent = title;
  document.getElementById("guestLocationHint").textContent = subtitle;

  triggerCardAnimation(card, "result-card error");
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

// 監聽語言變更事件，動態重繪卡片內容
window.addEventListener("scansign-lang-changed", () => {
  if (!currentCardState) return;
  if (currentCardState.type === 'success') {
    renderCardSuccess(currentCardState.guest, currentCardState.isDuplicate);
  } else if (currentCardState.type === 'error') {
    renderCardError(currentCardState.title, currentCardState.subtitle);
  }
});

const flipBtn = document.getElementById("flipViewBtn");
if (flipBtn) {
  flipBtn.addEventListener("click", () => {
    const isGuest = document.body.classList.toggle("mode-guest-facing");
    flipBtn.textContent = isGuest ? t("btnFlipStaff") : t("btnFlipGuest");
  });
}

let exportTimer = null;
export function bindExportAction(exportHandler) {
  const exportBtn = document.getElementById("exportSafeBtn");
  if (!exportBtn) return;

  exportBtn.addEventListener("click", () => {
    if (exportBtn.dataset.state === "confirming") {
      clearTimeout(exportTimer);
      exportBtn.dataset.state = "idle";
      exportBtn.textContent = t("btnExport");
      exportBtn.classList.remove("btn-confirming");
      exportHandler();
    } else {
      exportBtn.dataset.state = "confirming";
      exportBtn.textContent = t("btnExportConfirm");
      exportBtn.classList.add("btn-confirming");

      exportTimer = setTimeout(() => {
        exportBtn.dataset.state = "idle";
        exportBtn.textContent = t("btnExport");
        exportBtn.classList.remove("btn-confirming");
      }, 3000);
    }
  });
}
