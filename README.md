# ⚡ 一掃簽 ScanSign | 企業級零伺服器離線加密簽到系統

> **Zero-Server, Mathematically Unforgeable Offline Event Check-in PWA**
> 專為 300+ 人企業年會、宴會與研討會打造。採用純前端密碼學運算，落實「預設隱私（Privacy by Design）」，支援飛航模式斷網核驗。

---

## 繁體中文說明 (Traditional Chinese)

### 📌 專案簡介

**一掃簽 (ScanSign)** 是一款無後端、零資料庫依賴（Zero-Server Architecture）的單頁漸進式 Web 應用程式 (PWA)。系統利用現代瀏覽器原生 Web Crypto API，在完全斷網（Air-Gapped）環境下實現高安全性的票券簽發、離線核驗與防重複簽到。

### 🛡️ 核心安全架構與法規合規

* **非對稱數位簽章 (ECDSA P-256 / SHA-256)**：
* 每張入場憑證均包含唯一 Token ID (`TID`) 及對應私鑰簽名（格式：`v1.<TID>.<Base64URL_Sig>`）。
* 驗票端僅持有公鑰，杜絕偽造憑證或重放攻擊。


* **名冊端側認證加密 (PBKDF2 + AES-256-GCM)**：
* 名冊經 100,000 次 PBKDF2 密鑰衍生後以 AES-256-GCM 加密，只有持有工作 PIN 碼的前線設備方可於記憶體中解密。


* **全球法規遵從與治理**：
* **EU AI Act / ISO 42001**：本系統為純確定性演算法（Deterministic Algorithmic System），無自主模型、機器學習或推論流程，依法排除於人工智慧法規管轄。
* **香港私隱條例 (HK PDPO) / 歐盟 GDPR**：落實資料最小化（Data Minimization）與預設隱私原則，不回傳任何訪客名冊或簽到日誌至外部雲端。



### 🚀 核心功能

1. **純離線運作 (Air-Gapped PWA)**：支援 Service Worker 預快取與 W3C 子資源完整性（SRI）雜湊驗證，飛航模式下秒級啟動。
2. **端側產票工作台**：無需安裝額外軟體，主辦方可直接在瀏覽器輸入名冊與自訂 PIN 碼，自動簽名並生成可列印之 `tickets.html` 與加密名冊 `manifest.enc.json`。
3. **極速掃碼與反饋**：採用 Web Audio API 合成頻率反饋音效，搭配鏡頭邊框色彩動畫與雙向視角翻轉（工作人員視角 / 賓客迎賓視角）。
4. **雙軌防資料遺失**：支援 IndexedDB 本地持久化與記憶體降級模式，提供兩段式防呆 CSV 出缺席總表與資安稽核日誌匯出。

### 📁 專案目錄結構

```text
ScanSign/
├── index.html                   # 主操作入口 (CSP 緊縮與離線骨架)
├── manifest.webmanifest         # PWA 安裝設定檔
├── sw.js                        # Service Worker 離線快取與 SRI 守門員
├── css/
│   └── style.css                # 響應式深色主題與動畫樣式
├── js/
│   ├── app.js                   # 應用程式主邏輯與生命週期協調
│   ├── admin.js                 # 端側金鑰生成、名冊加密與產票引擎
│   ├── crypto.js                # Web Crypto API 加解密與 P-256 驗簽
│   ├── scanner.js               # 相機生命週期狀態機與防休眠 (WakeLock)
│   ├── search.js                # 手動補登即時索引與分欄位精準比對
│   ├── storage.js               # IndexedDB 雙軌存儲與資安日誌記錄
│   ├── ui.js                    # 聲學回饋合成、視圖翻轉與動態渲染
│   ├── i18n.js                  # 繁體中文 / 英文雙語國際化支援
│   └── frame-guard.js           # 嚴格防點擊劫持 (Clickjacking) 攔截
├── vendor/
│   ├── html5-qrcode.min.js      # 攝影機掃碼解析庫
│   └── qrcode.min.js            # 端側標準離線 QR 碼點陣生成庫
├── data/
│   ├── guests.csv               # 示範名冊範本
│   ├── manifest.enc.json        # 加密名冊成品 (含公鑰封裝)
│   ├── event_pin.txt            # 工作 PIN 碼保存檔 (受 .gitignore 保護)
│   └── event_private_key.pem    # 簽名私鑰 (受 .gitignore 保護)
└── scripts/
    ├── generate_event.py        # Python 批量產票與加密腳本
    └── inject_sw_integrity.py   # Service Worker SRI 雜湊自動注入工具

```

### 🛠️ 快速開始

#### 方式一：主辦方純網頁端作業（免安裝環境）

1. 使用瀏覽器開啟專案（需透過 HTTPS 或 localhost）。
2. 點擊頂部 **「🛠️ 產票與自訂PIN」**。
3. 設定工作 PIN 碼（純數字需 8 碼以上），貼上名冊內容後點擊 **「🚀 密碼學加密並產生檔案」**。
4. 下載 `manifest.enc.json`（分發給前線機台）與 `tickets.html`（發送給賓客或列印）。
5. 前線機台開啟頁面，選擇「自行載入名冊」，輸入自訂 PIN 碼即可進入飛航模式離線驗票。

#### 方式二：Python 命令列大量產票

```bash
# 1. 安裝必要密碼學依賴
pip install cryptography "qrcode[pil]"

# 2. 編輯名冊檔案 (data/guests.csv)
# 格式：姓名, 桌號, 電話後4碼

# 3. 執行批量簽發與加密
python scripts/generate_event.py

# 4. 更新 Service Worker 完整性校驗雜湊
python scripts/inject_sw_integrity.py

```

---

## English Documentation (README)

### 📌 Overview

**ScanSign** is a zero-server, privacy-first Progressive Web Application (PWA) designed for large-scale corporate galas, banquets, and conferences (300+ attendees). Powered strictly by the client-side Web Crypto API, it operates entirely offline in air-gapped environments without any backend server or external database dependency.

### 🛡️ Security & Regulatory Governance

* **Asymmetric Signatures (ECDSA P-256 / SHA-256)**:
* Each admission ticket contains a unique Token ID (`TID`) paired with an ECDSA private key signature (`v1.<TID>.<Base64URL_Sig>`).
* Stations only store the public key, rendering forgery and ticket duplication mathematically impossible.


* **Client-side Authenticated Encryption (PBKDF2 + AES-256-GCM)**:
* Roster data is encrypted via AES-256-GCM using keys derived through 100,000 iterations of PBKDF2. Only field devices provided with the event PIN can decrypt the manifest into memory.


* **Regulatory Alignment**:
* **EU AI Act & ISO/IEC 42001**: Formally excluded as a strictly deterministic algorithmic system with zero machine learning models, inference engines, or training pipelines.
* **HK PDPO & GDPR**: Strictly adheres to *Privacy by Design* and Data Minimization. Zero personal identifiable information (PII) is transmitted across network channels.



### 🚀 Key Features

1. **Air-Gapped Operation**: Pre-cached via Service Worker with strict W3C Subresource Integrity (SRI) validation, booting seamlessly in Airplane Mode.
2. **On-Site Admin Console**: Generate signed keys, encrypted manifests (`manifest.enc.json`), and printable batch tickets (`tickets.html`) entirely inside the browser without third-party services.
3. **Sub-Millisecond Verification & UI**: Zero-latency acoustic feedback synthesized via Web Audio API, real-time dynamic camera border flasher, and bidirectional flip mode (Staff view / Guest-facing welcome board).
4. **Resilient Data Audit**: Automatic fallback between IndexedDB and in-memory execution, coupled with two-step safe CSV check-in and security audit log export.

### 🛠️ Quick Start

#### Option A: Web-Only In-Browser Workflow

1. Access the web app over HTTPS or `http://localhost`.
2. Tap **"🛠️️ Admin Ticket Gen"** on the top navigation bar.
3. Configure your station PIN (min. 8 numeric digits) and paste your attendee list.
4. Click **"🚀 Cryptographically Sign & Encrypt"** to download `manifest.enc.json` and `tickets.html`.
5. On check-in devices, choose "📁 Load Custom Roster", upload the encrypted JSON, input the PIN, and enable Airplane Mode to begin scanning.

#### Option B: Python CLI Pipeline

```bash
# 1. Install cryptographic dependencies
pip install cryptography "qrcode[pil]"

# 2. Populate attendee roster in data/guests.csv (Name, Table, Last4Digits)

# 3. Generate credentials, encrypted manifest, and QR codes
python scripts/generate_event.py

# 4. Inject Subresource Integrity (SRI) hashes into Service Worker
python scripts/inject_sw_integrity.py

```

### 📄 License

Released under the MIT License. Built with strict adherence to ISO/IEC 27001, ISO/IEC 27701, HK PDPO, and GDPR Privacy by Design principles.
