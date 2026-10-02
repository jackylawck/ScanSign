# scripts/inject_sw_integrity.py
import hashlib, json, os

files_to_hash = [
    "./index.html", "./manifest.webmanifest", "./css/style.css",
    "./js/i18n.js", "./js/frame-guard.js", "./js/crypto.js",
    "./js/storage.js", "./js/scanner.js", "./js/ui.js",
    "./js/search.js", "./js/app.js", "./vendor/html5-qrcode.min.js"
]

integrity_map = {}
for path in files_to_hash:
    if os.path.exists(path):
        with open(path, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
            integrity_map[path] = f"sha256-{digest}"

with open("sw.js", "r") as f:
    sw_code = f.read()

updated_sw = sw_code.replace("__SW_RESOURCE_INTEGRITY_MAP__", json.dumps(integrity_map, indent=2))

with open("sw.js", "w") as f:
    f.write(updated_sw)

print("✅ sw.js 完整性雜湊注入完成（名冊已隔離保護）。")
