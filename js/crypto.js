// js/crypto.js

// 內建預設 Demo 名冊之備用公鑰 (未壓縮 65-byte Hex，04 + 128 個 0 作為佔位符)
export const DEFAULT_ECDSA_PUBKEY_HEX = "0400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

let cachedVerifyKey = null;

/**
 * 重置快取的驗簽公鑰 (換名冊或重新鎖定時調用)
 */
export function resetVerifyKey() {
  cachedVerifyKey = null;
}

/**
 * 嚴格判斷公鑰是否為預設的全零佔位符 (04 後接 128 個 0)
 */
function isPlaceholderPubKey(hex) {
  if (!hex || hex.length !== 130) return true;
  return /^040{128}$/i.test(hex);
}

/**
 * 設定當前活動名冊專屬的驗簽公鑰 (加入完整 Hex 字元與格式校驗)
 */
export async function setVerifyKeyFromRawHex(pubHex) {
  if (!pubHex || typeof pubHex !== 'string') {
    cachedVerifyKey = null;
    throw new Error("公鑰無效：未提供公鑰字串");
  }

  const cleanHex = pubHex.trim();
  // 嚴格校驗：長度 130、04 開頭，且其餘字元皆為合法十六進位字元
  if (!/^04[0-9a-fA-F]{128}$/.test(cleanHex)) {
    cachedVerifyKey = null;
    throw new Error(`公鑰格式錯誤：必須為 130 碼未壓縮 Raw Hex（以 04 開頭且包含合法 16 進位字元），當前長度: ${cleanHex.length}`);
  }

  try {
    const rawBytes = hexToBuffer(cleanHex);
    cachedVerifyKey = await crypto.subtle.importKey(
      "raw",
      rawBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch (err) {
    cachedVerifyKey = null;
    throw new Error(`Web Crypto 公鑰匯入失敗: ${err.message}`);
  }
}

/**
 * 取得當前有效的驗簽公鑰
 */
export async function getVerifyKey() {
  if (cachedVerifyKey) return cachedVerifyKey;

  // 若未手動載入自訂名冊公鑰，且預設公鑰並非全零佔位符，嘗試導入
  if (!isPlaceholderPubKey(DEFAULT_ECDSA_PUBKEY_HEX)) {
    try {
      await setVerifyKeyFromRawHex(DEFAULT_ECDSA_PUBKEY_HEX);
      return cachedVerifyKey;
    } catch (e) {
      console.warn("[Crypto] 預設公鑰載入失敗:", e);
      return null;
    }
  }

  return null;
}

/**
 * ECDSA P-256 數位簽章驗證 (P0 防禦：無有效公鑰絕對拒絕驗證)
 */
export async function verifySignature(tid, sigStr) {
  try {
    if (!tid || !sigStr) return false;

    const key = await getVerifyKey();
    if (!key) {
      console.error("[Crypto Security Alert] 當前環境缺少有效公鑰，一律阻斷驗簽請求！");
      return false; // 嚴格拒絕偽造與未授權通行
    }

    const data = new TextEncoder().encode(tid);
    // 明確指定 Base64 格式解析簽章
    const signature = parseBinaryToBuffer(sigStr, 'base64');

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      key,
      signature,
      data
    );
  } catch (err) {
    console.warn("[Crypto] 驗簽執行例外:", err);
    return false;
  }
}

/**
 * 使用自訂工作 PIN 碼解密 manifest.enc.json
 */
export async function decryptManifestWithPin(encData, pin) {
  if (!encData || typeof encData !== "object") {
    throw new Error("名冊資料無效：傳入的資料並非有效的 JSON 物件");
  }

  const enc = new TextEncoder();

  // 1. 嚴格規格與演算法相容性檢查
  if (encData.version && encData.version !== "1.0") {
    throw new Error(`不支援的名冊版本：${encData.version}（僅支援 1.0）`);
  }
  if (encData.kdf && encData.kdf !== "PBKDF2") {
    throw new Error(`不支援的密鑰衍生算法：${encData.kdf}`);
  }
  if (encData.cipher && encData.cipher !== "AES-256-GCM") {
    throw new Error(`不支援的對稱加密算法：${encData.cipher}`);
  }

  // 2. 前置檢查 salt、iv 與 ciphertext 完整性
  if (!encData.salt || !encData.iv) {
    throw new Error("名冊資料損毀：缺少加密必要的 salt 或 iv 參數");
  }

  const cipherPayload = encData.data || encData.ciphertext;
  if (!cipherPayload) {
    throw new Error("名冊資料損毀：缺少密文欄位 (data / ciphertext)");
  }

  // 顯式指定 Hex 格式解析，杜絕字元編碼歧義
  const saltBytes = parseBinaryToBuffer(encData.salt, 'hex');
  const ivBytes = parseBinaryToBuffer(encData.iv, 'hex');
  const cipherBytes = parseBinaryToBuffer(cipherPayload, 'hex');
  const iterations = encData.iterations || 100000;

  // 3. 密鑰衍生 (PBKDF2 100,000 次 SHA-256)
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

  // 4. 認證解密 (AES-256-GCM，自動驗證密文完整性 Tag)
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    cipherBytes
  );

  const parsedManifest = JSON.parse(new TextDecoder().decode(decryptedBuf));

  // 5. 強制綁定名冊專屬公鑰（無公鑰時立即阻斷）
  if (parsedManifest.__event_pubkey_hex) {
    await setVerifyKeyFromRawHex(parsedManifest.__event_pubkey_hex);
  } else {
    resetVerifyKey();
    throw new Error("名冊未封裝現場驗簽公鑰 (__event_pubkey_hex)，無法進行合規簽到！");
  }

  return parsedManifest;
}

/**
 * 二進位緩衝區轉換核心 (支援指定 'hex' 或 'base64'，消除字元歧義)
 */
export function parseBinaryToBuffer(str, format = 'auto') {
  if (typeof str !== "string") {
    if (str instanceof ArrayBuffer) return str;
    if (ArrayBuffer.isView(str)) return str.buffer.slice(str.byteOffset, str.byteOffset + str.byteLength);
    return new Uint8Array(str).buffer;
  }

  const cleanStr = str.trim();

  // 1. 指定或自動判斷 Hex 模式
  if (format === 'hex' || (format === 'auto' && /^[0-9a-fA-F]+$/.test(cleanStr) && cleanStr.length % 2 === 0)) {
    return hexToBuffer(cleanStr);
  }

  // 2. Base64 / Base64URL 模式 (支援 RFC 4648 URL 安全字元還原與 Padding 補齊)
  let b64 = cleanStr.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }

  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 現代化 Hex 轉換（使用 slice 取代已廢棄的 substr）
 */
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}
