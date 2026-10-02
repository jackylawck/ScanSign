// js/admin.js
import { t } from './i18n.js';

// 1. 純前端生成 ECDSA P-256 金鑰對 (Extractable 保障可導出公鑰)
export async function generateSigningKeyPair() {
  return await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

// 2. 針對 Token ID 進行數位簽章 (輸出緊湊 Base64URL，大幅降低 QR Code 密度以利秒掃)
export async function signToken(privateKey, tid) {
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    enc.encode(tid)
  );
  
  // 轉為 Base64URL 格式 (86 字元，取代原本臃腫的 128 字元 Hex)
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

// 3. 匯出公鑰為 65-Byte Raw Hex (04 + X + Y，長度固定 130 碼，供驗簽快速導入)
export async function exportPublicKeyRawHex(publicKey) {
  const rawBuf = await crypto.subtle.exportKey("raw", publicKey);
  return Array.from(new Uint8Array(rawBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 4. 使用自訂 PIN 碼執行 PBKDF2 + AES-256-GCM 加密名冊 (自動封裝公鑰)
export async function encryptManifestWithCustomPin(manifestObj, pin, publicKey = null) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 若提供公鑰，自動注入名冊內，現場工作台解鎖後立即載入對應公鑰秒驗
  const finalManifest = { ...manifestObj };
  if (publicKey) {
    finalManifest.__event_pubkey_hex = await exportPublicKeyRawHex(publicKey);
  }

  // 密鑰衍生 (PBKDF2 100,000 次雜湊)
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

  return {
    version: "1.0",
    kdf: "PBKDF2",
    iterations: 100000,
    cipher: "AES-256-GCM",
    salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    data: Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('')
  };
}

// 5. 解析主辦方貼上或匯入的 Excel / CSV 格式文字 (含引號清洗與過濾表頭)
export function parseGuestListInput(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const guests = [];

  for (const line of lines) {
    // 支援 Tab 或逗號分隔
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length >= 1) {
      // 去除可能殘留的 Excel 雙引號與多餘空白
      const clean = (s) => (s ? s.trim().replace(/^["']|["']$/g, '') : '');
      const name = clean(parts[0]) || "貴賓";
      const table = clean(parts[1]) || "1";
      const phone = clean(parts[2]) || "0000";

      // 自動過濾表頭提示行
      if (name === "姓名" && (table.includes("桌") || table.includes("圍") || table === "桌號")) {
        continue;
      }

      guests.push({ name, table, phone });
    }
  }
  return guests;
}

// 6. 備用 SPKI 格式導出
export async function exportPublicKeySpki(publicKey) {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(spki)));
}
