# scripts/inject_sw_integrity.py
import hashlib
import base64
import json
import os

# 包含核心靜態檔、所有 JS 模組（特別補上 admin.js）與第三方套件
files_to_hash = [
    "./index.html",
    "./manifest.webmanifest",
    "./css/style.css",
    "./js/i18n.js",
    "./js/frame-guard.js",
    "./js/crypto.js",
    "./js/storage.js",
    "./js/scanner.js",
    "./js/ui.js",
    "./js/search.js",
    "./js/admin.js",  # 必須補回此核心產票模組
    "./js/app.js",
    "./vendor/html5-qrcode.min.js"
]

integrity_map = {}
for path in files_to_hash:
    if os.path.exists(path):
        with open(path, "rb") as f:
            content = f.read()
            # 符合 W3C SRI 標準的 Base64 SHA-256 雜湊
            b64_digest = base64.b64encode(hashlib.sha256(content).digest()).decode('utf-8')
            integrity_map[path] = f"sha256-{b64_digest}"
    else:
        print(f"⚠️ 警告：找不到檔案 {path}，跳過計算。")

if not os.path.exists("sw.js"):
    print("❌ 錯誤：找不到 sw.js 檔案！")
    exit(1)

with open("sw.js", "r", encoding="utf-8") as f:
    sw_code = f.read()

if "__SW_RESOURCE_INTEGRITY_MAP__" not in sw_code:
    print("⚠️ 提醒：sw.js 中未發現 __SW_RESOURCE_INTEGRITY_MAP__ 佔位符。")

updated_sw = sw_code.replace("__SW_RESOURCE_INTEGRITY_MAP__", json.dumps(integrity_map, indent=2))

with open("sw.js", "w", encoding="utf-8") as f:
    f.write(updated_sw)

print("✅ sw.js 資源完整性雜湊注入完成（已納入 admin.js，名冊依規隔離保護）。")
