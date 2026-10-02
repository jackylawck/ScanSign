// js/storage.js
let db = null;
export let isIndexedDBAvailable = false;
let storageInitPromise = null;

let pendingDBWrites = 0;
let pendingSecurityWrites = 0;

let monotonicSeq = 0;
let securitySeq = 0;

export const inMemoryScannedSet = new Set();
export const inMemoryLogs = [];
export const inMemorySecurityLogs = []; // RAM 模式安全審計緩衝

export function getPendingCheckinWrites() {
  return pendingDBWrites;
}

export function getPendingSecurityWrites() {
  return pendingSecurityWrites;
}

export function getCheckedInCount() {
  return inMemoryScannedSet.size;
}

export function getSecurityLogs() {
  return inMemorySecurityLogs.slice();
}

/**
 * 清理當前 Session 記憶體暫存 (換名冊或重新鎖定時調用，防止跨活動資料污染)
 */
export function clearCurrentSessionMemory() {
  inMemoryScannedSet.clear();
  inMemoryLogs.length = 0;
  inMemorySecurityLogs.length = 0;
  monotonicSeq = 0;
  securitySeq = 0;
}

// 單例 Promise 快取，徹底解決並發連點時的時序穿透
export function initStorage() {
  if (storageInitPromise) return storageInitPromise;

  storageInitPromise = (async () => {
    try {
      db = await new Promise((resolve, reject) => {
        const req = window.indexedDB.open("ScanSignDB_v2", 2);
        req.onupgradeneeded = (e) => {
          const dbInstance = e.target.result;
          if (!dbInstance.objectStoreNames.contains("logs")) {
            const store = dbInstance.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
            store.createIndex("tid", "tid", { unique: false });
          }
          if (!dbInstance.objectStoreNames.contains("security_logs")) {
            const secStore = dbInstance.createObjectStore("security_logs", { keyPath: "id", autoIncrement: true });
            secStore.createIndex("event_type", "event_type", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      isIndexedDBAvailable = true;

      // 預載簽到日誌
      const tx = db.transaction("logs", "readonly");
      const store = tx.objectStore("logs");
      const request = store.getAll();

      await new Promise((resolve) => {
        request.onsuccess = () => {
          request.result.forEach(log => {
            inMemoryScannedSet.add(log.tid);
            inMemoryLogs.push(log);
            if (log.monotonic_seq && log.monotonic_seq > monotonicSeq) {
              monotonicSeq = log.monotonic_seq;
            }
          });
          resolve();
        };
        request.onerror = () => resolve();
      });

      // 預載安全日誌至 RAM 緩衝
      const secTx = db.transaction("security_logs", "readonly");
      const secStore = secTx.objectStore("security_logs");
      const secReq = secStore.getAll();
      await new Promise((resolve) => {
        secReq.onsuccess = () => {
          secReq.result.forEach(sec => {
            inMemorySecurityLogs.push(sec);
            if (sec.security_seq && sec.security_seq > securitySeq) {
              securitySeq = sec.security_seq;
            }
          });
          resolve();
        };
        secReq.onerror = () => resolve();
      });

    } catch (err) {
      console.warn("IndexedDB 受限，降級為純 RAM 模式:", err);
      isIndexedDBAvailable = false;
      const banner = document.getElementById("ramModeNotice");
      if (banner) banner.classList.remove("hidden");
    }
  })();

  return storageInitPromise;
}

export function recordCheckIn(logEntry) {
  logEntry.monotonic_seq = ++monotonicSeq;
  logEntry.verified = logEntry.verified || "pending";
  logEntry.method = logEntry.method || "scan";

  inMemoryScannedSet.add(logEntry.tid);
  inMemoryLogs.push(logEntry);

  if (isIndexedDBAvailable && db) {
    pendingDBWrites++;
    try {
      const tx = db.transaction("logs", "readwrite");
      const store = tx.objectStore("logs");
      const req = store.add(logEntry);
      
      req.onsuccess = (e) => {
        logEntry.__dbId = e.target.result;
      };

      tx.oncomplete = () => {
        pendingDBWrites--;

        // 若驗簽在 add 提交前完成，發起二次更新
        if (logEntry.verified !== "pending" && logEntry.__dbId) {
          try {
            const txSync = db.transaction("logs", "readwrite");
            const storeSync = txSync.objectStore("logs");
            const getReq = storeSync.get(logEntry.__dbId);
            getReq.onsuccess = (ev) => {
              const record = ev.target.result;
              if (record) {
                record.verified = logEntry.verified;
                storeSync.put(record);
              }
            };
            txSync.oncomplete = () => {};
            txSync.onerror = (e) => {
              console.warn("二次同步事務失敗:", e.target.error);
            };
          } catch (syncErr) {
            console.warn("落盤後追溯同步驗證狀態失敗:", syncErr);
          }
        }
      };

      tx.onerror = () => {
        pendingDBWrites--;
      };
    } catch (e) {
      console.warn("DB 寫入失敗:", e);
      pendingDBWrites--;
    }
  }

  return logEntry;
}

export function updateLogVerifiedStatus(entryRef, status) {
  if (!entryRef) return;
  entryRef.verified = status;

  if (isIndexedDBAvailable && db && entryRef.__dbId) {
    try {
      const tx = db.transaction("logs", "readwrite");
      const store = tx.objectStore("logs");
      const req = store.get(entryRef.__dbId);
      req.onsuccess = (e) => {
        const record = e.target.result;
        if (record) {
          record.verified = status;
          store.put(record);
        }
      };
      tx.oncomplete = () => {};
      tx.onerror = (e) => {
        console.warn("直接更新驗證狀態事務失敗:", e.target.error);
      };
    } catch (err) {
      console.warn("精準更新驗證狀態失敗:", err);
    }
  }
}

export async function drainPendingVerifications() {
  const hasPending = () => inMemoryLogs.some(l => l.verified === "pending");
  if (!hasPending()) return;

  let checkTimer = null;
  let timeoutTimer = null;

  try {
    await Promise.race([
      new Promise(resolve => {
        checkTimer = setInterval(() => {
          if (!hasPending()) resolve();
        }, 100);
      }),
      new Promise(resolve => {
        timeoutTimer = setTimeout(resolve, 3000);
      })
    ]);
  } finally {
    if (checkTimer !== null) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }
}

export function logSecurityIncident(eventType, detailPayload) {
  const incident = {
    event_type: eventType,
    details: detailPayload,
    recorded_at: new Date().toISOString(),
    security_seq: ++securitySeq
  };

  inMemorySecurityLogs.push(incident);

  if (isIndexedDBAvailable && db) {
    pendingSecurityWrites++;
    try {
      const tx = db.transaction("security_logs", "readwrite");
      tx.objectStore("security_logs").add(incident);
      tx.oncomplete = () => {
        pendingSecurityWrites--;
      };
      tx.onerror = (e) => {
        pendingSecurityWrites--;
        console.warn("安全審計交易異常:", e.target.error);
      };
    } catch (e) {
      pendingSecurityWrites--;
      console.warn("安全審計落盤失敗:", e);
    }
  }
}
