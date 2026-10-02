// js/search.js
import { inMemoryScannedSet } from './storage.js';
import { t } from './i18n.js';

let searchDebounceTimer = null;
let prebuiltIndex = [];

/**
 * 初始化搜尋索引（支援姓名、電話後4碼、票券編號 TID）
 */
export function initSearchIndex(manifest) {
  prebuiltIndex = Object.entries(manifest)
    // 排除內部特殊公鑰等欄位
    .filter(([key]) => !key.startsWith("__"))
    .map(([tid, guest]) => {
      const name = String(guest.name || "").trim();
      const phoneSuffix = String(guest.phone_suffix || guest.phone || "").trim();
      const cleanName = name.replace(/\s+/g, '').toLowerCase();

      return {
        tid,
        searchKey: `${cleanName}${phoneSuffix}${tid.toLowerCase()}`,
        name,
        table: String(guest.table || "--"),
        phoneSuffix
      };
    });
}

/**
 * 處理手動補登搜尋輸入
 */
export function handleSearchInput(query, onSelect) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const q = String(query || "").trim().toLowerCase();
    const resultsContainer = document.getElementById("searchResults");
    if (!resultsContainer) return;

    resultsContainer.innerHTML = "";
    if (!q) return;

    const matched = prebuiltIndex
      .filter(item => item.searchKey.includes(q))
      .slice(0, 5);

    if (matched.length === 0) {
      const emptyTip = document.createElement("div");
      emptyTip.className = "search-empty-tip";
      emptyTip.textContent = `查無相符賓客 (輸入: ${query})`;
      resultsContainer.appendChild(emptyTip);
      return;
    }

    matched.forEach(({ tid, name, table, phoneSuffix }) => {
      const isAlreadyScanned = inMemoryScannedSet.has(tid);

      const item = document.createElement("div");
      item.className = "search-item";

      const infoSpan = document.createElement("span");
      infoSpan.className = "search-item-info";
      infoSpan.textContent = `${isAlreadyScanned ? '✅ ' : ''}${name} (第 ${table} 圍/桌 | 末碼: ${phoneSuffix})`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isAlreadyScanned ? "btn-manual-confirm checked" : "btn-manual-confirm";
      btn.dataset.tid = tid;
      btn.textContent = isAlreadyScanned ? t("statusAlreadyChecked") : t("btnCheckIn");
      btn.disabled = isAlreadyScanned;

      if (!isAlreadyScanned) {
        btn.onclick = () => {
          onSelect(tid);
          resultsContainer.innerHTML = "";
          const input = document.getElementById("manualInput");
          if (input) {
            input.value = "";
            input.parentElement.classList.remove("has-val");
          }
        };
      }

      item.appendChild(infoSpan);
      item.appendChild(btn);
      resultsContainer.appendChild(item);
    });
  }, 100);
}
