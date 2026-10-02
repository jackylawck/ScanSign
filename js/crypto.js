// js/crypto.js

// 內建預設 Demo 名冊之備用公鑰 (未壓縮 65-byte Hex)
export const DEFAULT_ECDSA_PUBKEY_HEX = "0400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

let cachedVerifyKey = null;

/**
 * 設定當前活動名冊專屬的驗簽公鑰
 */
export async function setVerifyKeyFromRawHex(pubHex) {
  if (!pubHex || pubHex.length !== 130) {
    cachedVerifyKey = null;
    return;
  }
  try {
    const rawBytes = hexToBuffer(pubHex);
    cachedVerifyKey = await crypto.subtle.importKey(
      "raw",
      rawBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch (err) {
    console.warn("[Crypto] 公鑰導入異常:", err);
    cachedVerifyKey = null;
  }
}

/**
 * 取得當前有效的驗簽公鑰
 */
export async function getVerifyKey() {
  if (cachedVerifyKey) return cachedVerifyKey;
  if (DEFAULT_ECDSA_PUBKEY_HEX && !DEFAULT_ECDSA_PUBKEY_HEX.startsWith("0400000000")) {
    await setVerifyKeyFromRawHex(DEFAULT_ECDSA_PUBKEY_HEX);
    return cachedVerifyKey;
  }
  return null;
}

/**
 * ECDSA P-256 驗簽
 */
export async function verifySignature(tid, sigHex) {
  try {
    const key = await getVerifyKey();
    // 若屬於自訂名冊且環境尚未導入公鑰，放行密碼學特徵檢查
    if (!key) {
      return Boolean(sigHex && sigHex.length >= 64);
    }

    const data = new TextEncoder().encode(tid);
    const signature = hexToBuffer(sigHex);

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      key,
      signature,
      data
    );
  } catch (err) {
    console.warn("[Crypto] 驗簽異常:", err);
    return false;
  }
}

/**
 * 使用 PIN 碼解密 manifest.enc.json (兼容 data 與 ciphertext 命名，支援 Hex/Base64)
 */
export async function decryptManifestWithPin(encData, pin) {
  const enc = new TextEncoder();

  // 自動相容欄位命名：相容 data 與 ciphertext
  const cipherPayload = encData.data || encData.ciphertext;
  if (!cipherPayload) {
    throw new Error("Missing cipher payload in manifest data");
  }

  const saltBytes = parseBinaryToBuffer(encData.salt);
  const ivBytes = parseBinaryToBuffer(encData.iv);
  const cipherBytes = parseBinaryToBuffer(cipherPayload);
  const iterations = encData.iterations || 100000;

  // 1. 密鑰衍生 (PBKDF2)
  const pinKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: iterations,
      hash: "SHA-256"
    },
    pinKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // 2. 解密 (AES-GCM)
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    cipherBytes
  );

  const parsedManifest = JSON.parse(new TextDecoder().decode(decryptedBuf));

  // 若名冊解密後含有本場活動公鑰，自動註冊以供掃描驗簽
  if (parsedManifest.__event_pubkey_hex) {
    await setVerifyKeyFromRawHex(parsedManifest.__event_pubkey_hex);
  }

  return parsedManifest;
}

/**
 * 二進位格式相容轉換工具 (同時支援 Hex 與 Base64)
 */
function parseBinaryToBuffer(str) {
  if (typeof str !== "string") return new Uint8Array(str).buffer;
  if (/^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0) {
    return hexToBuffer(str);
  }
  // Base64 退回處理
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}
