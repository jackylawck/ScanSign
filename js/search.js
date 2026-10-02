// js/search.js
import { inMemoryScannedSet } from './storage.js';
import { t } from './i18n.js';

let searchDebounceTimer = null;
let prebuiltIndex = [];

export function initSearchIndex(manifest) {
  prebuiltIndex = Object.entries(manifest).map(([tid, guest]) => ({
    tid,
    searchKey: ((guest.name || '').replace(/\s+/g, '') + (guest.phone || '')).toLowerCase(),
    guest
  }));
}

export function handleSearchInput(query, onSelect) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const q = query.trim().toLowerCase();
    const resultsContainer = document.getElementById("searchResults");
    resultsContainer.innerHTML = "";
    if (!q) return;

    const matched = prebuiltIndex
      .filter(item => item.searchKey.includes(q))
      .slice(0, 5);

    matched.forEach(({ tid, guest }) => {
      const isAlreadyScanned = inMemoryScannedSet.has(tid);
      const safeTable = guest.table || "--";

      const item = document.createElement("div");
      item.className = "search-item";

      const infoSpan = document.createElement("span");
      infoSpan.className = "search-item-info";
      infoSpan.textContent = `${isAlreadyScanned ? '✅ ' : ''}${guest.name || 'Guest'} (${safeTable})`;

      const btn = document.createElement("button");
      btn.className = "btn-manual-confirm";
      btn.dataset.tid = tid;
      btn.textContent = isAlreadyScanned ? t("statusAlreadyChecked") : t("btnCheckIn");
      btn.disabled = isAlreadyScanned;

      if (isAlreadyScanned) {
        btn.style.background = "#64748b";
        btn.style.cursor = "not-allowed";
      } else {
        btn.onclick = () => {
          onSelect(tid);
          resultsContainer.innerHTML = "";
          const input = document.getElementById("manualInput");
          input.value = "";
          input.parentElement.classList.remove("has-val");
        };
      }

      item.appendChild(infoSpan);
      item.appendChild(btn);
      resultsContainer.appendChild(item);
    });
  }, 150);
}
