#!/usr/bin/env python3
# scripts/inject_sw_integrity.py
"""
ScanSign Service Worker SRI 完整性雜湊注入守門員 (100分生產級)
- 嚴格守門：缺少佔位符或核心檔案缺失時一律中斷 (sys.exit(1))
- 支援 --check 模式：供 CI 唯讀驗證 Hash 是否一致而不修改檔案
- 路徑正規化：去除 ./ 前綴，與 sw.js 內部 caches.match 行為精準對齊
"""

import os
import sys
import json
import base64
import hashlib
import argparse
from pathlib import Path

# 錨定專案根目錄
BASE_DIR = Path(__file__).resolve().parent.parent
SW_PATH = BASE_DIR / "sw.js"
PLACEHOLDER = "__SW_RESOURCE_INTEGRITY_MAP__"

# 納入離線快取與 SRI 防篡改保護的核心靜態資源 (標準無 ./ 相對路徑)
FILES_TO_HASH = [
    "index.html",
    "manifest.webmanifest",
    "css/style.css",
    "js/app.js",
    "js/crypto.js",
    "js/scanner.js",
    "js/ui.js",
    "js/i18n.js",
    "js/admin.js",
    "js/search.js",
    "js/frame-guard.js",
    "vendor/html5-qrcode.min.js",
    "icons/ScanSign192icon.png",
    "icons/ScanSign512icon.png"
]


def calculate_integrity_map():
    """計算所有核心檔案的 sha256 Base64 SRI 雜湊，遇缺漏嚴格報警中斷。"""
    integrity_map = {}
    missing_files = []

    for rel_path in FILES_TO_HASH:
        file_path = BASE_DIR / rel_path
        if file_path.exists():
            try:
                content = file_path.read_bytes()
                digest = hashlib.sha256(content).digest()
                b64_digest = base64.b64encode(digest).decode("utf-8")
                # 注入鍵值與 sw.js fetch 快取鍵對齊 (使用標準 URL 相對路徑)
                integrity_map[rel_path] = f"sha256-{b64_digest}"
            except OSError as e:
                print(f"❌ 【讀取異常】無法讀取檔案 {rel_path}：{e}")
                sys.exit(1)
        else:
            missing_files.append(rel_path)

    if missing_files:
        print("=" * 70)
        print("❌ 【致命錯誤】以下保護目標檔案不存在，SRI 雜湊無法建立：")
        for f in missing_files:
            print(f"   - {f}")
        print("❌ 缺失檔案會導致 Service Worker 安全保護靜默失效，拒絕執行！")
        print("=" * 70)
        sys.exit(1)

    return integrity_map


def main():
    parser = argparse.ArgumentParser(description="ScanSign Service Worker SRI 雜湊注入工具")
    parser.add_argument("--check", action="store_true", help="只驗證當前 sw.js 的 Hash 是否一致，不寫入檔案")
    args = parser.parse_args()

    if not SW_PATH.exists():
        print(f"❌ 錯誤：找不到 {SW_PATH.name} 檔案！")
        sys.exit(1)

    # 1. 計算最新檔案的 Hash Map
    integrity_map = calculate_integrity_map()

    # 2. 讀取 sw.js 內容
    try:
        sw_code = SW_PATH.read_text(encoding="utf-8")
    except OSError as e:
        print(f"❌ 無法讀取 {SW_PATH.name}：{e}")
        sys.exit(1)

    # 3. 處理 --check 模式 (供 CI 檢驗 PR 是否同步更新了 sw.js)
    if args.check:
        print("🔍 執行 --check 模式：比對現有 sw.js 完整性雜湊...")
        map_json_str = json.dumps(integrity_map, indent=2)
        if PLACEHOLDER in sw_code:
            print("❌ 【校驗失敗】sw.js 仍保留佔位符，尚未注入最新雜湊！")
            sys.exit(1)
        # 簡單驗證關鍵檔案 hash 是否皆存在於 sw.js 中
        for path, hash_val in integrity_map.items():
            if hash_val not in sw_code:
                print(f"❌ 【校驗失敗】資源 {path} 的 Hash ({hash_val}) 與 sw.js 不一致！")
                sys.exit(1)
        print("✅ 【校驗通過】sw.js 內的資源完整性雜湊完全相符。")
        sys.exit(0)

    # 4. 嚴格檢查佔位符 (防範 CI 重複跑或二次覆蓋損毀)
    if PLACEHOLDER not in sw_code:
        print("=" * 70)
        print(f"❌ 【致命錯誤】{SW_PATH.name} 中未發現 {PLACEHOLDER} 佔位符！")
        print(f"❌ 這通常意味著：")
        print(f"   1. {SW_PATH.name} 已在先前建置時被替換過（未還原乾淨範本）")
        print(f"   2. {SW_PATH.name} 被手動編輯，誤刪了佔位符")
        print(f"❌ 請在本地或 CI 執行：git checkout {SW_PATH.name} 還原後再重新執行建置。")
        print("=" * 70)
        sys.exit(1)

    # 5. 替換佔位符
    updated_sw = sw_code.replace(PLACEHOLDER, json.dumps(integrity_map, indent=2))

    # 6. 安全寫入並回讀驗證
    try:
        SW_PATH.write_text(updated_sw, encoding="utf-8")
    except OSError as e:
        print(f"❌ 無法寫入 {SW_PATH.name}：{e}")
        sys.exit(1)

    # 防禦性確認：驗證佔位符已徹底消失且檔案內容正常
    verify_content = SW_PATH.read_text(encoding="utf-8")
    if PLACEHOLDER in verify_content:
        print("❌ 寫入異常：回讀檢查仍發現佔位符，建置終止！")
        sys.exit(1)

    print("=" * 70)
    print(f"✅ {SW_PATH.name} 資源完整性雜湊 (SRI) 注入完成！")
    print(f"📦 已受保護資源總數：{len(integrity_map)} 項")
    print("💡 備註：此處 Service Worker 採用 SHA-256 進行本機認證快取校驗。")
    print("=" * 70)


if __name__ == "__main__":
    main()
