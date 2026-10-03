#!/usr/bin/env python3
# scripts/generate_event.py
"""
ScanSign 企業級離線產票與 Manifest 加密引擎 (100分終極完工版)
- 補簽冪等性：私鑰與 PIN 雙重持久化，補簽嘉賓絕不失效舊票與舊 PIN
- 零靜默災難：私鑰損壞直接中斷，杜絕自動覆寫造成歷史票券全廢
- 資安守門員：內建 .gitignore 規格檢測，防止機密金鑰推上公開 Repo
- 表頭精準防誤殺：兩欄名冊嚴格全匹配，杜絕一般嘉賓被吃單
"""

import os
import sys
import csv
import json
import base64
import re
import secrets
from pathlib import Path

# 密碼學核心依賴
try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption, load_pem_private_key
    )
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import qrcode
except ImportError:
    print("❌ 缺少必要依賴套件，請先執行：pip install cryptography qrcode[pil]")
    sys.exit(1)

# 錨定專案根目錄
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
QRCODES_DIR = BASE_DIR / "qrcodes"
PRIVATE_KEY_PATH = DATA_DIR / "event_private_key.pem"
PIN_PATH = DATA_DIR / "event_pin.txt"
MANIFEST_PATH = DATA_DIR / "manifest.enc.json"
CSV_PATH = DATA_DIR / "guests.csv"


def der_to_p1363_raw(der_sig: bytes) -> bytes:
    """將 ASN.1 DER 格式 ECDSA 簽章解碼為 Web Crypto 相容之 IEEE P1363 raw (r||s，64 bytes)。"""
    r, s = decode_dss_signature(der_sig)
    return r.to_bytes(32, byteorder='big') + s.to_bytes(32, byteorder='big')


def to_base64url(data: bytes) -> str:
    """轉換為無填充的 RFC 4648 Base64URL 字串。"""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def sanitize_filename(name: str) -> str:
    """清理嘉賓姓名中的特殊字元，保障檔名跨平台相容。"""
    cleaned = re.sub(r'[^\w\-\u4e00-\u9fff]', '_', name)
    return cleaned[:30]


def normalize_table(table_raw: str) -> str:
    """桌號正規化，保留分區與字母後綴 (例如 8A, VIP1)。"""
    s = str(table_raw or '').strip()
    match = re.match(r'^([A-Za-z\u4e00-\u9fff]*)[\s\-]*(\d+)([A-Za-z]?)', s)
    if match:
        prefix = re.sub(r'^(table|桌|圍|第)', '', match.group(1), flags=re.IGNORECASE).strip().upper()
        num = match.group(2)
        suffix = match.group(3).upper() if match.group(3) else ''
        return f"{prefix}{num}{suffix}"
    cleaned = re.sub(r'^(table|桌|圍|第)\s*', '', s, flags=re.IGNORECASE).strip()
    return cleaned or "1"


def is_header_row(row: list) -> bool:
    """多語系中英文表頭偵測（兩欄名冊嚴格全匹配，杜絕李家明、桌8被誤判）。"""
    if not row or len(row) < 2:
        return False
    header_keywords = [
        "姓名", "名字", "貴賓姓名", "嘉賓姓名",
        "name", "guest name", "full name",
        "桌號", "桌", "圍", "table", "table no", "table number",
        "電話", "手機", "phone", "mobile", "tel"
    ]
    lower_cells = [str(c).strip().lower() for c in row if c]
    matches = sum(
        1 for c in lower_cells
        if any(kw in c for kw in header_keywords)
    )

    # 關鍵防禦：若名冊只有兩欄，必須全數命中關鍵字才視為表頭
    if len(lower_cells) <= 2:
        return matches == len(lower_cells)
    return matches >= max(2, len(lower_cells) / 2)


def is_valid_pin(pin: str) -> bool:
    """與前端 admin.js 完全一致的 PIN 強度檢驗規則。"""
    p = str(pin or '').strip()
    if len(p) < 6:
        return False
    if p.isdigit() and len(p) < 8:
        return False
    if len(set(p)) == 1:
        return False
    return True


def check_gitignore_security():
    """啟動時安全審查：確保敏感個資與金鑰已被 .gitignore 阻斷。"""
    gitignore_path = BASE_DIR / ".gitignore"
    required = [
        "data/event_private_key.pem",
        "data/event_pin.txt",
        "data/guests.csv"
    ]
    if not gitignore_path.exists():
        print("⚠️ 【安全警報】專案根目錄尚未建立 .gitignore！")
        print("⚠️ 為了防止個資與私鑰外洩至 GitHub，請務必建立 .gitignore。")
        return

    content = gitignore_path.read_text(encoding="utf-8")
    missing = [rule for rule in required if rule not in content]
    if missing:
        print(f"⚠️️ 【安全警告】.gitignore 缺少機密排除規則：{missing}")


def load_or_create_private_key():
    """載入活動私鑰；若損壞立即終止報警，絕不自動覆寫致歷史票券全廢。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if PRIVATE_KEY_PATH.exists():
        try:
            with open(PRIVATE_KEY_PATH, "rb") as f:
                key = load_pem_private_key(f.read(), password=None)
                print(f"🔑 已載入既有活動私鑰：{PRIVATE_KEY_PATH.name} (相容補簽模式)")
                return key
        except Exception as e:
            print("=" * 70)
            print(f"❌ 【致命錯誤】既有私鑰檔載入異常：{e}")
            print(f"❌ 私鑰損壞將導致先前所有已派發的 QR Code 100% 驗簽失敗！")
            print(f"❌ 若確定要重置整場活動，請手動刪除 {PRIVATE_KEY_PATH} 後再重新執行。")
            print("=" * 70)
            sys.exit(1)

    private_key = ec.generate_private_key(ec.SECP256R1())
    with open(PRIVATE_KEY_PATH, "wb") as f:
        f.write(private_key.private_bytes(
            Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
        ))
    print(f"🔑 已生成並持久化新活動私鑰：{PRIVATE_KEY_PATH.name}")
    return private_key


def load_or_create_pin() -> str:
    """PIN 碼載入機制：優先延用既有 PIN（補簽模式），杜絕覆寫發出給前線的密碼。"""
    # 1. 優先使用現存的 PIN 檔案 (確保補簽時不會讓工作人員手上的 PIN 失效)
    if PIN_PATH.exists():
        try:
            existing = PIN_PATH.read_text(encoding="utf-8").strip()
            if is_valid_pin(existing):
                print(f"🔒 已沿用既有活動 PIN 碼：{PIN_PATH.name} (補簽不失效模式)")
                return existing
        except OSError:
            pass

    # 2. 其次讀取環境變數
    env_pin = os.environ.get("SCANSIGN_EVENT_PIN", "").strip()
    if env_pin:
        if is_valid_pin(env_pin):
            try:
                PIN_PATH.write_text(env_pin, encoding="utf-8")
                print(f"🔒 已套用環境變數指定之 PIN 碼並保存至：{PIN_PATH.name}")
                return env_pin
            except OSError as e:
                print(f"⚠️ 無法寫入 PIN 檔案：{e}")
                return env_pin
        else:
            print(f"⚠️ 環境變數 SCANSIGN_EVENT_PIN ({env_pin}) 強度不符規範，將自動生成安全 PIN。")

    # 3. 隨機生成 8 位純數字高強度 PIN
    new_pin = "".join(secrets.choice("0123456789") for _ in range(8))
    try:
        PIN_PATH.write_text(new_pin, encoding="utf-8")
        print(f"🔒 已生成新活動 PIN 碼並保存至：{PIN_PATH.name}")
    except OSError as e:
        print(f"⚠️ 無法寫入 PIN 檔案：{e}")
    return new_pin


def load_or_create_roster_csv(csv_path: Path) -> list:
    """讀取名冊 CSV，支援逗號與 Tab，並落實 PII 最小化。"""
    if not csv_path.exists():
        print(f"ℹ️ 未找到 {csv_path.name}，自動生成預設名冊範本...")
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        default_data = [
            ["姓名", "桌號", "手機"],
            ["陳大文 (Chan Tai Man)", "1", "98761234"],
            ["李小翠 (Lee Siu Chui)", "2", "65435678"],
            ["張家明 (Cheung Ka Ming)", "5A", "51239012"],
            ["黃佩儀 (Wong Pui Yee)", "8", "90123456"],
            ["王志強", "3", "88885566"]
        ]
        with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(default_data)

    guests = []
    with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
        sample = f.read(2048)
        f.seek(0)
        delimiter = '\t' if '\t' in sample else ','
        reader = csv.reader(f, delimiter=delimiter)

        rows = [r for r in reader if r and any(c.strip() for c in r)]
        if not rows:
            return []

        start_idx = 1 if is_header_row(rows[0]) else 0

        for i, row in enumerate(rows[start_idx:], start=1):
            name = row[0].strip() if len(row) > 0 and row[0].strip() else "貴賓"
            table_raw = row[1].strip() if len(row) > 1 else "1"
            phone_raw = row[2].strip() if len(row) > 2 else ""

            # 嚴格只提取數字末 4 碼，若完全無數字則統一為 "0000"
            phone_digits = re.sub(r'\D', '', phone_raw)
            if len(phone_digits) >= 4:
                phone_suffix = phone_digits[-4:]
            elif phone_digits:
                phone_suffix = phone_digits.zfill(4)
            else:
                phone_suffix = "0000"

            guests.append({
                "tid": f"G{i:04d}",
                "name": name,
                "table": normalize_table(table_raw),
                "phone_suffix": phone_suffix
            })

    return guests


def main():
    print("=" * 70)
    print("🚀 ScanSign 企業級離線產票與名冊加密工具 (生產級終極版)")
    print("=" * 70)

    # 0. 執行資安環境檢查
    check_gitignore_security()

    # 1. 取得持久化 ECDSA P-256 私鑰並衍生公鑰
    private_key = load_or_create_private_key()
    public_key = private_key.public_key()
    pub_hex = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint).hex()

    # 2. 取得持久化 PIN 碼 (補簽時延用舊 PIN)
    event_pin = load_or_create_pin()

    # 3. 讀取名冊
    guests = load_or_create_roster_csv(CSV_PATH)
    if not guests:
        print("❌ 名冊內無有效嘉賓資料，操作終止。")
        sys.exit(1)

    print(f"📋 成功載入名冊：{CSV_PATH.name}，共 {len(guests)} 位嘉賓。")

    # 4. 逐筆簽名並產生高容錯 QR Code (Error Correction H)
    QRCODES_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}

    for g in guests:
        tid = g["tid"]
        
        # ECDSA 簽名：DER 轉 Web Crypto 相容之 IEEE P1363 (64 bytes)
        der_signature = private_key.sign(tid.encode('utf-8'), ec.ECDSA(hashes.SHA256()))
        raw_p1363 = der_to_p1363_raw(der_signature)
        sig_b64url = to_base64url(raw_p1363)

        # 標準傳輸 Payload：v1.<tid>.<Base64URL_Sig>
        payload = f"v1.{tid}.{sig_b64url}"

        manifest[tid] = {
            "name": g["name"],
            "table": g["table"],
            "phone_suffix": g["phone_suffix"]
        }

        # QR Code 生成 (Error Correction H，30% 容錯防反光)
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        safe_name = sanitize_filename(g["name"])
        img_path = QRCODES_DIR / f"{tid}_{safe_name}.png"
        try:
            img.save(str(img_path))
        except OSError as e:
            print(f"❌ 無法寫入 QR Code 檔案 ({img_path})：{e}")
            sys.exit(1)

    print(f"✅ 成功產出 {len(guests)} 張高容錯票券至：{QRCODES_DIR.name}/")

    # 5. 注入活動公鑰進 Manifest
    manifest["__event_pubkey_hex"] = pub_hex

    # 6. PBKDF2 (100,000 次) + AES-256-GCM 加密名冊
    salt = os.urandom(16)
    iv = os.urandom(12)

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000
    )
    aes_key = kdf.derive(event_pin.encode('utf-8'))
    aesgcm = AESGCM(aes_key)

    manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode('utf-8')
    ciphertext = aesgcm.encrypt(iv, manifest_bytes, None)

    encrypted_payload = {
        "version": "1.0",
        "kdf": "PBKDF2",
        "iterations": 100000,
        "cipher": "AES-256-GCM",
        "salt": salt.hex(),
        "iv": iv.hex(),
        "ciphertext": ciphertext.hex()
    }

    try:
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(encrypted_payload, f, ensure_ascii=False, indent=2)
    except OSError as e:
        print(f"❌ 無法寫入加密名冊檔案：{e}")
        sys.exit(1)

    print("=" * 70)
    print("🎉 【ScanSign 活動名冊與密鑰已就緒】")
    print(f"📁 加密名冊位置：{MANIFEST_PATH.relative_to(BASE_DIR)}")
    print(f"📄 解鎖 PIN 檔案：{PIN_PATH.relative_to(BASE_DIR)} (請透過保密通道派發)")
    if sys.stdout.isatty():
        print(f"🔒 本次工作 PIN 碼：{event_pin}")
    print("=" * 70)


if __name__ == "__main__":
    main()
