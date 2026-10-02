// js/admin.js
import { t } from './i18n.js';

// 1. 純前端生成 ECDSA P-256 金鑰對
export async function generateSigningKeyPair() {
  return await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

// 2. 針對 Token ID 進行數位簽章
export async function signToken(privateKey, tid) {
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    enc.encode(tid)
  );
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 3. 使用自訂 PIN 碼執行 PBKDF2 + AES-GCM 加密名冊
export async function encryptManifestWithCustomPin(manifestObj, pin) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 密鑰衍生
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

  const plaintext = enc.encode(JSON.stringify(manifestObj));
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

// 4. 解析主辦方貼上的 Excel / CSV 格式文字
export function parseGuestListInput(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const guests = [];

  for (const line of lines) {
    // 支援 Tab 或逗號分隔
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length >= 1) {
      const name = parts[0]?.trim() || "貴賓";
      const table = parts[1]?.trim() || "1";
      const phone = parts[2]?.trim() || "0000";
      guests.push({ name, table, phone });
    }
  }
  return guests;
}

// 5. 匯出公鑰為 SPKI Base64 (供驗簽比對)
export async function exportPublicKeySpki(publicKey) {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(spki)));
}
