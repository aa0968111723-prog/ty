# 產品契約：淡江大學社團博覽會 60 秒專注力挑戰賽

此專案永遠只是「社博現場 60 秒專注力挑戰遊戲」。禁止改造成聊天、會員、CRM、問卷或多遊戲平台。

## 正式流程

掃 QR / 打開網址 → 首頁理解活動 → 選關主、填姓名、科系、年級、電話 → 15 秒練習（不登記）→ 開始全新 60 秒正式 Stroop → 分數／正確率／連擊／稱號 → 寫入成績（給攤位）→ 可再挑戰。

不收集電子信箱。試玩不登記、不抽獎。前五名與手搖杯得獎不在網站公開，由現場公布。

## 遊戲規則

- 中央文字字義與視覺顏色永遠不同
- 模式：【字面意思】或【視覺顏色】
- 答對 +100；連擊 ≥5 時 +200；答錯 −50，最低 0
- 每次有效作答後只切換一次模式
- 正式賽總時間 60 秒（依牆鐘，背景分頁不可延長）
- 普通使用者不可修改遊戲設定；前台齒輪只開啟管理員登入，不是設定入口。
- 成績重試沿用原本的 submissionId、完成時間與完整資料。未確認的成績在同一分頁 sessionStorage 暫存最多 8 小時；重新整理後可重試，成功或放棄後清除。儲存空間被禁用時仍可在畫面內重試，但無法跨重新整理恢復。
- Apps Script 以試算表為持久化去重依據，寫入前加鎖。同 ID、同資料回覆 duplicate；同 ID、不同資料回覆 conflict，不能覆寫原紀錄。

## 稱號

- Lv.1 心靈修煉者（0+）
- Lv.2 潛力領袖（1500+）
- Lv.3 穩定領航者（2500+）
- Lv.4 卓越領袖（3500+）

稱號只描述這次 60 秒的專注表現，不是人格測驗。

## 語言與中文輔助

- The default interface language is Traditional Chinese; the previous language choice is retained.
- An `EN / 中文` switcher is available on the registration, settings, game, and result screens.
- English mode keeps concise Traditional Chinese helper text beside key instructions and fields.
- Department, grade, and registration values continue to use the existing internal format so the booth registration and prize-draw workflow remain compatible.

## API

`/api/health` `GET`、`/api/register` `POST`、`/api/result` `POST`、`/api/leaderboard` `GET`

網站不公開排行榜。`/api/leaderboard` 不回傳姓名或分數。成績只寫入現場表單給攤位使用。

## 部署

Canonical：TanStack Start，`npm run dev` 綁定 0.0.0.0:8080。正式站用同一套 `/api/*`。Google Sheet / SMTP 為選用，掛掉時遊戲仍可玩。

## 管理後台與 Google 整合

- `/admin` 以伺服器環境變數 `ADMIN_PASSWORD` 登入；`ADMIN_SESSION_SECRET` 必須至少 32 bytes，使用獨立隨機值。未設定時拒絕啟用，不提供預設密碼。正式 Zeabur 部署另設 `PUBLIC_ORIGIN=https://leader-dna-mcp-a7k2.zeabur.app`，供伺服器在 reverse proxy 後驗證登入與登出的同源 `Origin`。
- Cookie 使用 `__Host-`、HttpOnly、Secure、SameSite=Strict、Path=/，8 小時到期；正式部署必須 HTTPS。更換密碼或 session secret 會使既有 session 失效。登出清除瀏覽器 cookie。
- 所有 `/api/admin/*` 資料端點要求有效 session，回應 private/no-store；登入、登出要求同源 Origin。個資與前三名不會出現在公開排行榜。
- 統計使用 Asia/Taipei 日期；Google Form 與有效正式遊戲紀錄合併，姓名經 NFKC、移除空白與大小寫正規化後去重。重複姓名保留當日最新紀錄及其關主；試玩、練習、無效成績不計入。前三名是當日有效正式成績排序。
- 伺服器設定 `GOOGLE_SCRIPT_URL`（HTTPS Apps Script web app URL）、`PASSWORD`（獨立連接器密碼）、`GOOGLE_SHEET_ID`、`GOOGLE_SHEET_TAB`（正式成績分頁）、`GOOGLE_FORM_SHEET_TAB`（表單回覆分頁）。所有變數均不可使用 `VITE_` 前綴。
- 部署 `scripts/club-google-apps-script.gs`，以試算表擁有者身分執行。Script Properties 的 `PASSWORD`、`GOOGLE_SHEET_ID`、`GOOGLE_SHEET_TAB`、`GOOGLE_FORM_SHEET_TAB` 必須與伺服器設定一致；Google Form 的回覆目的地需連至該試算表的表單回覆分頁。
- 表單支援姓名、手機／手機號碼／電話、科系／系所、年級、關主／關主姓名、時間戳記等欄位。不要刪除成績分頁的 submissionId 欄或修改既有紀錄。
- Google 資料來源失敗時，後台顯示部分資料與同步異常；不把失敗當作完整零人數，也不洩漏連接器密碼或上游錯誤內容。
- 自動測試使用 mock Google／Apps Script 合約，不需要真實 Google 登入。DOM 手機測試以 `CLUB_BROWSER_URL` 指定已啟動的站點後執行 `node --test scripts/club-browser.test.mjs`，可用 `CHROMIUM_PATH` 指定既有瀏覽器；不讀取或產生截圖。
