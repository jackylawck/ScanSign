# ScanSign: Compliance, Privacy Architecture & Regulatory Mapping
# 「一掃簽」：法規遵從、隱私架構與監管合規判定白皮書

---

## 1. Executive Summary / 執行摘要

**ScanSign** is a zero-server, offline-first Progressive Web Application (PWA) designed for high-assurance event verification. It operates on deterministic client-side cryptography (ECDSA P-256 digital signatures and PBKDF2/AES-GCM encryption), requiring zero persistent backend infrastructure and executing zero unsolicited external data egress.

「一掃簽 (ScanSign)」為一套零伺服器、離線優先的漸進式網頁應用（PWA），專為高安全要求之實體活動簽到驗證設計。系統底層完全依賴確定性客戶端密碼學（ECDSA P-256 數位簽章與 PBKDF2/AES-GCM 資料加密），不依賴任何常駐後端伺服器架構，且絕無任何非必要的外部網路資料傳輸。

---

## 2. Regulatory Applicability Assessment / 監管適用性判定報告

### 2.1 Artificial Intelligence Regulations (EU AI Act, ISO/IEC 42001, CAC) / 人工智慧監管法規
* **EU AI Act (Regulation (EU) 2024/1689)**: **OUT OF SCOPE (不適用)**  
  * *Reasoning*: The system utilizes deterministic optical parsing and mathematical verification via standard cryptographic hashing and signature primitives. It contains no statistical inference, machine learning (ML), or automated neural processing as defined under Article 3(1).
  * *判定理由*：本系統採用確定性光學幾何定位與密碼學驗簽機制，不具備自主推論能力，完全不包含機器學習（ML）或統計模型，依法不構成歐盟 AI 法案所管轄之「人工智慧系統」。
* **ISO/IEC 42001 (AIMS)**: **OUT OF SCOPE (不適用)**  
  * *Reasoning*: As no AI models are designed, developed, fine-tuned, or deployed, an Artificial Intelligence Management System (AIMS) does not apply.
  * *判定理由*：系統未曾設計、微調、調用或部署任何 AI 模型，無須建置 AIMS 架構。
* **CAC Regulations (國家互聯網信息辦公室相關規定)**: **OUT OF SCOPE (不適用)**  
  * *Reasoning*: The application does not deploy algorithm-driven recommendation, generative AI, or deep synthesis technologies.
  * *判定理由*：系統不具備演算法推薦、深度合成或生成式人工智慧功能，無須履行境內演算法備案程序。

---

### 2.2 Data Privacy & Security Frameworks / 資料隱私與資安框架 (GDPR, HK PDPO, ISO)


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                       ScanSign Privacy by Design Paradigm                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Pre-Event] Encrypted Roster (AES-GCM) ──► Published on Static Host        │
│                                                                             │
│  [At Gate]   Station Staff PIN ──► PBKDF2 Derived Key ──► Local RAM Decrypt │
│                                                                             │
│  [Execution] Camera Stream ──► Local Scan ──► Memory Set (0ms Air-Gapped)   │
│                                                                             │
│  [Post-Event] Manual Encrypted CSV Export ──► Local Destruction on Unload   │
└─────────────────────────────────────────────────────────────────────────────┘

```

#### A. Hong Kong Personal Data (Privacy) Ordinance (Cap. 486) / 香港《個人資料（私隱）條例》
* **DPP 1 - Purpose and Manner of Collection (收集目的及方式)**:  
  * Strict data minimization: Only Token ID (`tid`), masked phone suffix, and table allocations are processed.
  * 貫徹資料最小化原則：僅處理不可逆票券識別碼（`tid`）、遮蔽電話後四碼及席位桌號。
* **DPP 2 - Accuracy and Duration of Retention (準確性及保留期限)**:  
  * Roster is only loaded into volatile RAM. No server database retains records.
  * 名冊僅在運行期間保留於揮發性記憶體（RAM），後端無任何常駐資料庫留存。
* **DPP 3 - Use of Data (個人資料的使用)**:  
  * Processed exclusively for identity admission verification during the specified event.
  * 資料僅嚴格限於活動現場入場核驗，絕無二次商業使用。
* **DPP 4 - Security of Data (個人資料的保安)**:  
  * Cryptographic protection using AES-256-GCM. Unsalted access is mathematically infeasible.
  * 使用 AES-256-GCM 進行静態加密，杜絕未經授權之純文字讀取。

#### B. EU General Data Protection Regulation (GDPR - Regulation (EU) 2016/679)
* **Article 25 (Privacy by Design and by Default / 預設與設計隱私)**:  
  Full client-side zero-knowledge architecture. The cloud hosting infrastructure (GitHub Pages) acts merely as a content delivery pipeline, possessing zero decryption capabilities.
* **Article 32 (Security of Processing / 處理安全性)**:  
  Military-grade authenticated encryption (AES-GCM) with random IVs and PBKDF2 (100,000 iterations).

#### C. ISO/IEC 27001:2022 & ISO/IEC 27701:2019 Alignment / 國際資安標準控制項映射
* **A.8.24 (Use of Cryptography / 密碼學技術之使用)**:  
  Deterministic key pair signing using ECDSA P-256; secure PBKDF2-SHA256 key stretching.
* **A.8.20 (Network Security / 網路安全)**:  
  Content Security Policy enforces `default-src 'none'` and restricts outbound connections (`connect-src 'self'`), fully neutralizing data exfiltration channels.
* **PIMS Governance (隱私資訊管理)**:  
  Implements strict physical Air-Gap operation SOP during active scanning.

---

## 3. Threat Model & Mitigation Matrix / 資安威脅模型與防禦矩陣

| Threat Vector / 威脅向量 | Potential Impact / 潛在影響 | Architectural Defense / 架構級防禦手段 |
|---|---|---|
| **Ticket Forgery / 偽造票券** | Unauthorized entry / 非法入場 | ECDSA P-256 cryptographic verification; mathematically infeasible to forge without private key. |
| **Roster Interception / 名冊攔截** | Mass PII leak / 批量個資外洩 | AES-256-GCM payload encryption; rainbow table defense via PBKDF2 (100,000 rounds). |
| **Data Exfiltration / 惡意回傳** | Covert data theft / 隱蔽外傳 | Strict CSP (`connect-src 'self'`); completely operational under device Airplane Mode. |
| **Formula Injection / 試算表注入** | Admin machine takeover (CWE-1236) | Automated `csvEscape()` sanitization prefixing dangerous characters (`=`, `+`, `-`, `@`, `\t`, `\r`, `\n`) with single quotes. |
| **Clickjacking / 點擊劫持** | UI Redressing | External `js/frame-guard.js` halting execution and destructing DOM if embedded in unauthorized iframes. |
