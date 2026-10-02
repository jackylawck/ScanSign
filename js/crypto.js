// js/crypto.js
// 填入 GitHub Actions 生成的未壓縮 65-byte 公鑰 Hex
export const EVENT_ECDSA_PUBKEY_HEX = "0400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

let cachedKey = null;

export async function getVerifyKey() {
  if (cachedKey) return cachedKey;
  const rawBytes = hexToBuffer(EVENT_ECDSA_PUBKEY_HEX);
  cachedKey = await crypto.subtle.importKey(
    "raw",
    rawBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  return cachedKey;
}

export async function verifySignature(tid, sigHex) {
  try {
    const key = await getVerifyKey();
    const data = new TextEncoder().encode(tid);
    const signature = hexToBuffer(sigHex);

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      key,
      signature,
      data
    );
  } catch (err) {
    console.warn("驗簽異常:", err);
    return false;
  }
}

export async function decryptManifestWithPin(encData, pin) {
  const enc = new TextEncoder();
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
      salt: hexToBuffer(encData.salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    pinKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBuffer(encData.iv) },
    aesKey,
    hexToBuffer(encData.ciphertext)
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}
