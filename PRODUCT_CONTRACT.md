# 產品契約：淡江大學社團博覽會 60 秒專注力挑戰賽

此專案永遠只是「社博現場 60 秒專注力挑戰遊戲」。禁止改造成聊天、會員、CRM、問卷或多遊戲平台。

## 正式流程

掃 QR / 打開網址 → 首頁看懂兩種規則 → 選關主、填姓名、科系、年級、電話 → 兩題新手教學（不計時、不登記）→ 15 秒練習（不登記）→ 開始全新 60 秒正式 Stroop → 分數／正確率／連擊／稱號 → 寫入成績（給攤位）→ 可再挑戰或查看公開排行榜。

不收集電子信箱。試玩不登記、不抽獎。前五名與手搖杯得獎不在網站公開，由現場公布。公開排行榜不是得獎公告，只顯示遮罩姓名與成績。

## 遊戲規則

- 中央文字字義與視覺顏色永遠不同
- 模式：【字面意思】或【視覺顏色】
- 答對 +100；連擊 ≥5 時 +200；答錯 −50，最低 0
- 每次有效作答後隨機指定【字面意思】或【視覺顏色】（可與上一題相同）
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
- An `EN / 中文` switcher is available on the registration, settings, game, result, and leaderboard screens.
- English mode keeps concise Traditional Chinese helper text beside key instructions and fields.
- Department, grade, and registration values continue to use the existing internal format so the booth registration and prize-draw workflow remain compatible.

## API

`/api/health` `GET`、`/api/register` `POST`、`/api/result` `POST`、`/api/leaderboard` `GET`

`/api/leaderboard?scope=today` 與 `/api/leaderboard?scope=history` 回傳公開排行榜。未指定 scope 時視為 `today`。成功回應快取 30 秒（`Cache-Control: public, max-age=30`），並有頻率限制。成績只寫入遊戲分頁（sheetId 896311128），不可寫入招生狀況表或總表。

## 公開排行榜

`/leaderboard` 為手機優先頁面，可切換今日／歷史，顯示前三名與完整名次。

入榜規則：

- 只統計正式 60 秒、官方設定、有效且成功儲存的遊戲。
- 排除 practice、warmup、skipSave、錯誤設定與重複 submissionId。
- 今日排行榜依 Asia/Taipei 當日 `completedAt` 計算。
- 每位玩家只保留最高分（優先以正規化手機辨識同一人，其次姓名）；重玩不得重複佔榜。
- 歷史排行榜計算所有日期的個人最高分。
- 同分依正確率、答對數、最佳連續、完成時間（較早者在前）排序。

公開列只顯示：遮罩姓名、分數、正確率、稱號、時間。不顯示電話、完整姓名、submissionId、科系、年級或關主。完整個資與原始資料只能在登入後的 `/admin` 查看。

## 部署

Canonical：TanStack Start，`npm run dev` 綁定 0.0.0.0:8080。正式站用同一套 `/api/*`。Google Sheet / SMTP 為選用，掛掉時遊戲仍可玩。

## 管理後台與 Google 整合

- `/admin` 以管理員密碼登入。未設定 `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` 時，現場仍可用攤位密碼 `tkuzen` 與已授權裝置的指紋／PIN 快速解鎖。設定完成後自動改用環境變數中的密碼與 session secret，不必再改畫面。`ADMIN_SESSION_SECRET` 正式站應至少 32 bytes；未設定時僅供預覽／尚未接環境變數的攤位使用內建後備。若另設 `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`ADMIN_ALLOWED_EMAILS`，可選 Google 帳號作為額外登入。正式部署另設 `PUBLIC_ORIGIN`，供伺服器在 reverse proxy 後驗證同源 `Origin`。
- 已授權裝置可設定 4 碼 PIN（server-side scrypt hash）與 WebAuthn／Passkey（指紋、Face ID、裝置解鎖）。新裝置必須先用密碼（或已設定時的 Google）登入後才能登記指紋／PIN。PIN 連續錯誤由伺服器限速（5 次暫停 30 秒、10 次 5 分鐘、15 次要求重新用密碼登入）。
- Cookie 使用 `__Host-`、HttpOnly、Secure；session 為 SameSite=Strict、8 小時到期，OAuth state 為 SameSite=Lax。正式部署必須 HTTPS。裝置撤銷會立刻讓該裝置的 PIN、Passkey 與 session 失效。登出清除瀏覽器 session cookie，仍可在信任裝置上快速解鎖。
- 所有 `/api/admin/*` 資料端點要求有效 session，回應 private/no-store；登入、登出與 PIN／Passkey 變更要求同源 Origin。完整個資、電話、submissionId 與原始成績不會出現在公開排行榜。OAuth session、PIN hash、WebAuthn 公鑰、trusted device 與 challenge 存在伺服器資料庫，不寫入招生 Google Sheet。
- 統計使用 Asia/Taipei 日期；Google Form 與有效正式遊戲紀錄合併，姓名經 NFKC、移除空白與大小寫正規化後去重。重複姓名保留當日最新紀錄及其關主；試玩、練習、無效成績不計入。前三名是當日有效正式成績排序。
- 伺服器設定 `GOOGLE_SERVICE_ACCOUNT_JSON`（完整的 Service Account JSON 字串）、`GOOGLE_SHEET_ID`、`GOOGLE_GAME_SHEET_TAB`（正式成績分頁，預設 sheetId 896311128 的 09/14 後玩遊戲分頁）。遊戲寫入只跟 gid `896311128`；舊環境的 `GOOGLE_SHEET_TAB`（例如不存在的「國際生專區」）不再作為遊戲寫入目標。`GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB`（招生狀況表）、`GOOGLE_RECRUITMENT_MASTER_SHEET_TAB`（總表）仍可設定。舊環境的 `GOOGLE_FORM_SHEET_TAB` 仍可後備給表單讀取。程式會解析 JSON 並還原 `private_key` 內以 `\n` 表示的換行，使用 `https://www.googleapis.com/auth/spreadsheets` scope；所有變數均不可使用 `VITE_` 前綴。
- 正式遊戲只寫入 sheetId 896311128 的 09/14 後玩遊戲分頁。不要從遊戲路徑寫入「招生狀況表」或「總表」。`submissionId` / `_submissionId` 為唯一事件 ID：同 ID 同資料回 duplicate，同 ID 不同資料回 conflict，不得覆寫。
- 已登入夥伴可在 `/follow-up`「接引人快速填表」直接填完分級、活動、入社、保證金等並「送出招生資料」，寫入「招生狀況表」。招生 Google Form（2026招生狀況表單-上）仍保留：同一頁可打開完整 `/viewform` PREFILL。接引人預設為目前選的夥伴，不覆蓋遊戲關主。已填過的學生不再出現。總表既有公式維持不變。
- `/api/admin/recruitment` 需有效 session，一次聚合遊戲分頁、招生狀況表與總表，供招生戰情與快速填表使用。個資不會出現在公開排行榜或 public API。
- Service Account 必須能編輯指定試算表；伺服器直接使用 Sheets API 的 `values.get`、`values.update` 與 `values.batchUpdate`。Google Form 的回覆目的地需連至同一試算表的表單回覆分頁。
- `GOOGLE_SCRIPT_URL`、`PASSWORD` 與 `scripts/club-google-apps-script.gs` 保留作為快速回退用途，目前執行路徑不會呼叫 Apps Script。
- 表單支援姓名、手機／手機號碼／電話、科系／系所、年級、關主／關主姓名、時間戳記等欄位。不要刪除成績分頁的 submissionId 欄或修改既有紀錄。
- Google 資料來源失敗時，後台顯示部分資料與同步異常；不把失敗當作完整零人數，也不洩漏連接器密碼或上游錯誤內容。
- 自動測試使用 mock Google Sheets API／舊版 Apps Script 合約，不需要真實 Google 登入。排行榜入榜、去重、遮罩與公開欄位由 `src/lib/club/leaderboard.test.mjs` 與 API 合約測試覆蓋。DOM 手機測試以 `CLUB_BROWSER_URL` 指定已啟動的站點後執行 `node --test scripts/club-browser.test.mjs`，可用 `CHROMIUM_PATH` 指定既有瀏覽器；不讀取或產生截圖。
