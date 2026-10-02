# Personal Information Collection Statement (PICS) & Privacy Notice
# 個人資料收集聲明與現場隱私須知

---

### 1. Statement of Purpose / 收集目的
The ScanSign verification terminal deployed at this venue processes your credential data exclusively for the purpose of attendee authentication, admission logistics, and table allocation for today's event.

本現場工作台使用之「一掃簽 (ScanSign)」系統，僅為處理本日活動之身分核對、入場引導及席位安排之目的而讀取台端之入場憑證。

---

### 2. Nature of Data Processed / 資料處理範疇
* **Data Fields**: Attendee Token Identifier, masked telephone digits (if applicable), and designated seating coordinates.
* **Non-Collection**: This system does **NOT** capture, store, or transmit biometric identifiers, unmasked government ID numbers, facial imagery, or live audio.
* **資料項目**：入場識別碼、遮蔽式電話後碼（如適用）及指定席位桌號。
* **不收集項目**：本系統**絕不**採集、存儲或傳輸任何生物特徵、身分證字號、臉部影像或現場環境錄音。

---

### 3. Data Processing Methodology / 資料處理架構保證
* **Zero-Server Processing (零伺服器架構)**: Verification is computed entirely within the terminal's volatile memory (RAM).
* **Air-Gap Operational Mode (離線作業模式)**: Devices operate disconnected from external wide-area networks (WAN). No telemetry, tracking cookies, or analytic payloads are gathered.
* **零伺服器處理**：所有票券核驗程序均於現場單機設備之揮發性記憶體（RAM）內即時運算完成。
* **物理隔離作業**：現場設備於飛航模式（斷網狀態）下離線運作，無任何追蹤日誌（Cookies）、分析外掛或背景外傳管道。

---

### 4. Retention & Erasure / 保留與銷毀程序
All volatile data resident in browser memory is purged upon station shutdown or reload. Exported check-in logs generated for organizers are encrypted and will be destroyed following the conclusion of event auditing in compliance with Hong Kong PDPO Data Protection Principle 2 and GDPR Article 5(1)(e).

所有暫存在瀏覽器內部之揮發性資料，於系統關閉或重載時將自動銷毀清空。經主辦方依法匯出之簽到稽核日誌均經過安全編碼，將於活動核算完成後依香港《個人資料（私隱）條例》第二保障原則及 GDPR 規定自毀。

---

### 5. Contact & Inquiries / 聯繫與權利查閱
If you have questions regarding the handling of your data during this event, please approach the on-site Chief Privacy Officer / Event Secretariat desk.

若對本日活動之個人資料處理流程有任何疑問或需查詢，請親臨現場總務處或向大會個人資料保障主任洽詢。

```

---

### 三、 為什麼這樣的交付能最大程度保障你？

1. **專業卸責與邊界確立（Legal Insulation）**：
在 `COMPLIANCE.md` 的 Section 2.1 中，明確以 EU AI Act 第 3(1) 條之法律定義進行 **負面清單論證（Negative Scope Proof）**。法務或監管者看到這段時，會立刻明白此係統為「非 AI 之確定性密碼學工具」，避免了隨意被套上高風險 AI 繁瑣審查的合規成本。
2. **正面對齊個資隱私法典（Proactive Alignment）**：
將技術代碼架構中的特性（無伺服器、飛航模式、RAM 運算、`csvEscape` 防 CWE-1236）精確對應到香港私隱條例 DPP1–DPP4 與 GDPR 第 25/32 條。這證明了系統並非「欠缺伺服器」，而是「為隱私與資訊安全主動採用的高標準零信任架構（Privacy by Design）」。
