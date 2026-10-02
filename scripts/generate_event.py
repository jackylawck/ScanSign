# scripts/generate_event.py
import json
import os
import qrcode
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def main():
    # 1. 產生標準 ECDSA P-256 金鑰對
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    pub_hex = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint).hex()

    print("=" * 70)
    print("【第一步：更新前端公鑰】")
    print("請將以下 65-byte 公鑰 Hex 複製並貼入 js/crypto.js 中的 EVENT_ECDSA_PUBKEY_HEX：")
    print(pub_hex)
    print("=" * 70)

    # 2. 活動真實名冊資料範例 (亦可替換為 pandas 讀取名冊 Excel/CSV)
    guests = [
        {"tid": "T1001", "name": "陳大文 (Chan Tai Man)", "table": "第 1 圍", "zone": "貴賓前區", "diet": "一般餐", "phone": "1234"},
        {"tid": "T1002", "name": "李小翠 (Lee Siu Chui)", "table": "第 2 圍", "zone": "貴賓前區", "diet": "素食", "phone": "5678"},
        {"tid": "T1003", "name": "張家明 (Cheung Ka Ming)", "table": "第 5 圍", "zone": "會場中區", "diet": "一般餐", "phone": "9012"},
        {"tid": "T1004", "name": "黃佩儀 (Wong Pui Yee)", "table": "第 8 圍", "zone": "會場後區", "diet": "一般餐", "phone": "3456"}
    ]

    os.makedirs("qrcodes", exist_ok=True)
    manifest = {}

    for g in guests:
        tid = g["tid"]
        # 對 tid 進行 SHA-256 非對稱簽名
        signature = private_key.sign(tid.encode('utf-8'), ec.ECDSA(hashes.SHA256()))
        sig_hex = signature.hex()
        
        # 產出標準 Payload：v1.<tid>.<sig>
        payload = f"v1.{tid}.{sig_hex}"
        manifest[tid] = g
        
        # 產生供工作人員/賓客使用的 QR Code 圖片
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        safe_name = g["name"].split()[0]
        img.save(f"qrcodes/{tid}_{safe_name}.png")

    print(f"✅ 已成功產出 {len(guests)} 張票券 QR Code 至 qrcodes/ 資料夾")

    # 3. 使用現場 PIN 碼加密名冊 (PBKDF2 100,000 次 + AES-256-GCM)
    EVENT_PIN = "8899"  # 設定現場給工作人員解鎖的 4-8 位 PIN 碼
    salt = os.urandom(16)
    iv = os.urandom(12)

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000
    )
    aes_key = kdf.derive(EVENT_PIN.encode('utf-8'))
    aesgcm = AESGCM(aes_key)

    manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode('utf-8')
    ciphertext = aesgcm.encrypt(iv, manifest_bytes, None)

    encrypted_payload = {
        "salt": salt.hex(),
        "iv": iv.hex(),
        "ciphertext": ciphertext.hex()
    }

    os.makedirs("data", exist_ok=True)
    with open("data/manifest.enc.json", "w", encoding="utf-8") as f:
        json.dump(encrypted_payload, f, ensure_ascii=False, indent=2)

    print("=" * 70)
    print("【第二步：名冊檔案就緒】")
    print(f"已產出加密名冊: data/manifest.enc.json (解鎖 PIN: {EVENT_PIN})")
    print("請將 data/manifest.enc.json 提交 (git commit) 至 GitHub 倉庫根目錄。")
    print("=" * 70)

if __name__ == "__main__":
    main()
