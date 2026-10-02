// js/ui.js
import { t } from './i18n.js';

const card = document.getElementById("resultCard");
let currentCardState = null;

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
  
  const rawTable = guest.tableNo || guest.table || "";
  const tableNo = rawTable.replace(/[^0-9]/g, '') || "?";
  const locationText = `${guest.zone || 'Main Hall'} · ${guest.diet || 'Standard'}`;

  // 工作人員端
  document.getElementById("staffGuestName").textContent = (isDuplicate ? `⚠️ (${t("statusAlreadyChecked")}) ` : "✅ ") + (guest.name || "Guest");
  document.getElementById("staffTableDigit").textContent = tableNo;
  document.getElementById("staffTableUnit").textContent = t("tableUnit");
  document.getElementById("staffLocationHint").textContent = locationText;

  // 賓客端
  document.getElementById("guestTableDigit").textContent = tableNo;
  document.getElementById("guestTableUnit").textContent = t("guestTableUnit");
  document.getElementById("guestWelcomeText").textContent = isDuplicate ? t("statusAlreadyChecked") : t("welcome");
  document.getElementById("guestLocationHint").textContent = locationText;

  triggerCardAnimation(card, isDuplicate ? "result-card duplicate" : "result-card success");

  if (navigator.vibrate) {
    navigator.vibrate(isDuplicate ? [60, 50, 60] : 45);
  }
}

export function renderCardError(title, subtitle) {
  currentCardState = { type: 'error', title, subtitle };

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
flipBtn.addEventListener("click", () => {
  const isGuest = document.body.classList.toggle("mode-guest-facing");
  flipBtn.textContent = isGuest ? t("btnFlipStaff") : t("btnFlipGuest");
});

let exportTimer = null;
export function bindExportAction(exportHandler) {
  const exportBtn = document.getElementById("exportSafeBtn");
  exportBtn.addEventListener("click", () => {
    if (exportBtn.dataset.state === "confirming") {
      clearTimeout(exportTimer);
      exportBtn.dataset.state = "idle";
      exportBtn.textContent = t("btnExport");
      exportBtn.style.background = "";
      exportHandler();
    } else {
      exportBtn.dataset.state = "confirming";
      exportBtn.textContent = t("btnExportConfirm");
      exportBtn.style.background = "#b91c1c";

      exportTimer = setTimeout(() => {
        exportBtn.dataset.state = "idle";
        exportBtn.textContent = t("btnExport");
        exportBtn.style.background = "";
      }, 3000);
    }
  });
}
