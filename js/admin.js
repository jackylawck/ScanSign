// js/admin.js

/**
 * 0. 執行環境 Web Crypto 安全上下文檢查
 */
export function isCryptoAvailable() {
  return typeof crypto !== 'undefined' &&
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.subtle.generateKey === 'function';
}

function ensureCryptoEnvironment() {
  if (!isCryptoAvailable()) {
    throw new Error(
      "Web Crypto API 不可用！\n" +
      "原因：瀏覽器限制安全上下文（Secure Context）。\n" +
      "解決方法：請透過 HTTPS 網址訪問，或在本地使用 localhost（禁止直接以 file:// 協議開啟）。"
    );
  }
}

/**
 * 1. PIN 碼強度校驗 (純數字需 8 位，混合字元需 6 位)
 */
export function validatePin(pin) {
  const p = String(pin || '').trim();
  if (p.length < 6) {
    return { ok: false, reason: "工作 PIN 碼至少需 6 位字元" };
  }
  if (/^\d+$/.test(p) && p.length < 8) {
    return { ok: false, reason: "純數字 PIN 至少需 8 位（建議混合英文字母以提升安全性）" };
  }
  if (/^(.)\1+$/.test(p)) {
    return { ok: false, reason: "PIN 碼不可為完全相同之重複字元 (如 111111)" };
  }
  return { ok: true };
}

/**
 * 2. 唯一 Token ID (TID) 標準生成器
 */
export function generateTid(index, prefix = 'G') {
  return `${prefix}${String(index + 1).padStart(4, '0')}`;
}

/**
 * 3. 純前端生成 ECDSA P-256 金鑰對
 */
export async function generateSigningKeyPair() {
  ensureCryptoEnvironment();
  return await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

/**
 * 4. 針對 Token ID 進行數位簽章 (輸出緊湊 Base64URL，降低 QR 密度以利秒掃)
 */
export async function signToken(privateKey, tid) {
  ensureCryptoEnvironment();
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    enc.encode(tid)
  );

  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 5. 匯出公鑰為 65-Byte Raw Hex (04 + X + Y，長度固定 130 碼)
 */
export async function exportPublicKeyRawHex(publicKey) {
  ensureCryptoEnvironment();
  const rawBuf = await crypto.subtle.exportKey("raw", publicKey);
  return Array.from(new Uint8Array(rawBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 6. 使用自訂 PIN 碼執行 PBKDF2 + AES-256-GCM 加密名冊 (自動封裝公鑰)
 * 關鍵修復：產出 ciphertext 欄位，徹底對齊 Python generate_event.py 與 crypto.js 解密器
 */
export async function encryptManifestWithCustomPin(manifestObj, pin, publicKey = null) {
  ensureCryptoEnvironment();
  
  const validation = validatePin(pin);
  if (!validation.ok) {
    throw new Error(`PIN 安全強度不足：${validation.reason}`);
  }

  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const finalManifest = { ...manifestObj };
  if (publicKey) {
    finalManifest.__event_pubkey_hex = await exportPublicKeyRawHex(publicKey);
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const plaintext = enc.encode(JSON.stringify(finalManifest));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    plaintext
  );

  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const cipherHex = Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    version: "1.0",
    kdf: "PBKDF2",
    iterations: 100000,
    cipher: "AES-256-GCM",
    salt: saltHex,
    iv: ivHex,
    ciphertext: cipherHex, // 核心修復：標準密文屬性名
    data: cipherHex       // 防禦性回退相容
  };
}

/**
 * 7. 標準 RFC 4180 CSV 單行狀態機解析器
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * 8. 多語系表頭偵測器 (規則 3 要求 >= 3 欄，避免兩欄誤殺)
 */
const HEADER_KEYWORDS = [
  "姓名", "名字", "貴賓姓名", "嘉賓姓名",
  "name", "guest name", "full name", "attendee",
  "table", "桌號", "桌", "圍", "table no", "table number",
  "phone", "電話", "手機", "mobile", "tel", "phone suffix"
];

function isHeaderRow(parts) {
  if (!parts || parts.length < 2) return false;

  const lowerParts = parts.map(p => (p || '').trim().toLowerCase());

  const exactMatches = lowerParts.filter(val =>
    HEADER_KEYWORDS.some(kw => val === kw)
  ).length;

  const containsMatches = lowerParts.filter(val =>
    HEADER_KEYWORDS.some(kw => val.includes(kw))
  ).length;

  // 規則 1：至少 2 個欄位完全相符
  if (exactMatches >= 2) return true;

  // 規則 2：1 個精確相符 + 至少 2 個包含相符
  if (exactMatches >= 1 && containsMatches >= 2) return true;

  // 規則 3：全欄位包含關鍵字，但要求至少 3 欄以上，防止兩欄特殊名冊被誤判
  if (containsMatches === parts.length && parts.length >= 3) return true;

  return false;
}

/**
 * 9. 桌號格式正規化 (保留 VIP-1、A區8號 等完整前綴與後綴)
 */
function normalizeTable(raw) {
  const s = String(raw || '').trim();
  const match = s.match(/^([A-Za-z\u4e00-\u9fff]*)[\s\-]*(\d+)([A-Za-z]?)/);
  if (match) {
    let prefix = match[1] ? match[1].replace(/^(table|桌|圍|第)/i, '').trim().toUpperCase() : '';
    const num = match[2];
    const suffix = match[3] ? match[3].toUpperCase() : '';
    return `${prefix}${num}${suffix}`;
  }

  const cleaned = s.replace(/^(table|桌|圍|第)\s*/i, '').trim();
  return cleaned || "1";
}

/**
 * 10. 解析名冊輸入 (相容 Excel Tab 貼上與標準 CSV，並正規化提取手機末 4 碼)
 */
export function parseGuestListInput(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const guests = [];

  for (const line of lines) {
    const parts = line.includes('\t') ? line.split('\t') : parseCSVLine(line);

    if (parts.length >= 1) {
      const clean = (s) => (s ? s.trim().replace(/^["']|["']$/g, '') : '');
      const rawName = clean(parts[0]);
      const rawTable = clean(parts[1]);
      const rawPhone = clean(parts[2]);

      if (isHeaderRow([rawName, rawTable, rawPhone])) {
        continue;
      }

      const name = rawName || "貴賓";
      const table = normalizeTable(rawTable);

      // 核心修復：正規化提取純數字末 4 碼，與後端 Python 邏輯精準對齊
      const phoneDigits = rawPhone.replace(/\D/g, '');
      let phone = "0000";
      if (phoneDigits.length >= 4) {
        phone = phoneDigits.slice(-4);
      } else if (phoneDigits.length > 0) {
        phone = phoneDigits.padStart(4, '0');
      }

      guests.push({ name, table, phone });
    }
  }
  return guests;
}

/**
 * 11. 防禦性 SPKI 匯出
 */
export async function exportPublicKeySpki(publicKey) {
  ensureCryptoEnvironment();
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  const bytes = new Uint8Array(spki);
  if (bytes.byteLength === 0) {
    throw new Error("SPKI 匯出失敗：公鑰為空");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
