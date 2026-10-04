// js/search.js
import { inMemoryScannedSet } from './storage.js';
import { t } from './i18n.js';

let searchDebounceTimer = null;
let prebuiltIndex = [];

/**
 * 0. 輔助工具：安全截斷異常長度字串防破框
 */
function sanitizeSearchQuery(str, maxLen = 40) {
  return String(str || '').trim().slice(0, maxLen);
}

/**
 * 1. 初始化搜尋索引（支援姓名、電話後4碼、票券編號 TID）
 * 具備 null/undefined 防禦性容錯
 */
export function initSearchIndex(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    prebuiltIndex = [];
    return;
  }

  prebuiltIndex = Object.entries(manifest)
    // 排除內部特殊公鑰等欄位
    .filter(([key]) => !key.startsWith("__"))
    .map(([tid, guest]) => {
      const name = String(guest?.name || "").trim();
      const phoneSuffix = String(guest?.phone_suffix || guest?.phone || "").trim();
      const cleanName = name.replace(/\s+/g, '').toLowerCase();
      const cleanTid = String(tid || '').trim().toLowerCase();

      return {
        tid,
        cleanName,
        phoneSuffix,
        cleanTid,
        name,
        table: String(guest?.table || "--"),
      };
    });
}

/**
 * 2. 處理手動補登搜尋輸入 (分欄位精準匹配，杜絕跨欄位假性命中)
 */
export function handleSearchInput(query, onSelect) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const rawQ = sanitizeSearchQuery(query);
    const q = rawQ.toLowerCase().replace(/\s+/g, '');
    const resultsContainer = document.getElementById("searchResults");
    if (!resultsContainer) return;

    resultsContainer.innerHTML = "";
    if (!q) return;

    // 分欄位精準匹配：姓名包含、電話末4碼包含、或 TID 包含
    const matched = prebuiltIndex
      .filter(item => 
        item.cleanName.includes(q) ||
        item.phoneSuffix.includes(q) ||
        item.cleanTid.includes(q)
      )
      .slice(0, 5);

    if (matched.length === 0) {
      const emptyTip = document.createElement("div");
      emptyTip.className = "search-empty-tip";
      // 支援多語系與安全截斷
      emptyTip.textContent = `${t("unknownTicket") || "查無相符賓客"} (${rawQ})`;
      resultsContainer.appendChild(emptyTip);
      return;
    }

    matched.forEach(({ tid, name, table, phoneSuffix }) => {
      const isAlreadyScanned = inMemoryScannedSet.has(tid);

      const item = document.createElement("div");
      item.className = "search-item";

      const infoSpan = document.createElement("span");
      infoSpan.className = "search-item-info";
      infoSpan.textContent = `${isAlreadyScanned ? '✅ ' : ''}${name} (第 ${table} ${t("tableUnit") || "圍/桌"} | 末碼: ${phoneSuffix})`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isAlreadyScanned ? "btn-manual-confirm checked" : "btn-manual-confirm";
      btn.dataset.tid = tid;
      btn.textContent = isAlreadyScanned ? (t("statusAlreadyChecked") || "已報到") : (t("btnCheckIn") || "補登");
      btn.disabled = isAlreadyScanned;

      if (!isAlreadyScanned && typeof onSelect === "function") {
        btn.onclick = () => {
          onSelect(tid);
          resultsContainer.innerHTML = "";
          const input = document.getElementById("manualInput");
          if (input) {
            input.value = "";
            input.parentElement?.classList.remove("has-val");
          }
        };
      }

      item.appendChild(infoSpan);
      item.appendChild(btn);
      resultsContainer.appendChild(item);
    });
  }, 100);
}
