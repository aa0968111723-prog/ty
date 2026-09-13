# 招生資料流

學生打開 ty → 選關主、填資料 → 15 秒練習（不寫入）→ 60 秒正式遊戲 → 以 `submissionId` 寫入 Google Sheet 遊戲分頁（gid `896311128`，標題為 `09/` 接 `14後玩遊戲`）→ 已登入夥伴打開 `/follow-up`「接引人快速填表」→ 在後台填完招生題並「送出招生資料」，或用完整 `/viewform` PREFILL 打開正式 Google Form → 兩者都進入「招生狀況表」（gid `1921679351`，A:Q 既有欄位不變）→ 既有「總表」（gid `0`）公式自動整理 → `/admin` 招生戰情讀總表＋遊戲分頁＋招生狀況表。

ty 不是第二套招生真相。Google Sheets 與現有 Google Form 仍是招生工作流核心。遊戲**只寫** gid `896311128` 那一頁，不寫「招生狀況表」或「總表」。後台內建表單是夥伴主動送出，目的地與 Google Form 相同。

## 分頁

| 分頁 | sheetId | 用途 |
| --- | --- | --- |
| 總表 | 0 | 既有 LET / ARRAYFORMULA / FILTER / VSTACK，不要覆寫 |
| 茶會報名 | 107799715 | 活動報名，遊戲不寫入 |
| 招生狀況表 | 1921679351 | Google Form 目的地。技術欄只能加在最後 |
| 遊戲成績（gid 896311128） | 896311128 | 正式遊戲唯一寫入目標；標題為 `09/` 接 `14後玩遊戲` |

程式用分頁標題；啟動 diagnostics 會再核對 sheetId。預設標題是 `09/` + `14後玩遊戲`（中間沒有空白）。

## 遊戲關主 vs 正式招生接引人

| 角色 | 來源 | 會不會被接引人覆蓋 |
| --- | --- | --- |
| 遊戲關主 | 學生開局時選的現場帶關 | 否。預填進備註「遊戲關主」，寫入 `_gameGatekeeper` |
| 正式招生接引人 | `/follow-up` 目前登入後選的夥伴 | 預填進表單「接引人(可複選)」 |

## 正式 Google Form PREFILL

- 表單 ID：`12fk5ubMY0fnCSSTEljFJ1l-gcao1hDMkw7F8I8qTlOw`
- **PREFILL 基底必須是完整 `/viewform` URL**，不可用 `forms.gle` 短網址當 query 基底。
- 發布 URL：`https://docs.google.com/forms/d/e/1FAIpQLSdzbqD9Bq4qaRu5HVfUS-pTNLSKiFcmGNs72w2lWuZ9u6TE7A/viewform`
- `forms.gle/CBmNvkcvSQMzvh9X7` 只是短址，會 302 到上面的 `/viewform`；程式若看到短址會改寫成 `/viewform` 再加 `usp=pp_url`。

Entry ID 於 2026-09-13 自發布頁 HTML `FB_PUBLIC_LOAD_DATA_` 讀出，**不要自造**：

| 欄位 | 題目 | entry |
| --- | --- | --- |
| 正式招生接引人 | 接引人(可複選) | `entry.1318284482` |
| 接引日期（月／日，預設今天） | 接引日期 | `entry.526408341_month` / `_day` |
| 姓名 | 同學的姓名 | `entry.887514514` |
| 電話 | 同學電話/LINE | `entry.1668669667` |
| 系級 | 系級 | `entry.628075911` |
| 遊戲完成時間、遊戲關主、submissionId | 備註（現行表單沒有獨立題） | `entry.88032894` 開頭三行 |

夥伴在表單裡繼續填分級、活動、入社、保證金、備註其餘內容。預填欄位都可改。

現行表單**沒有**獨立的「遊戲完成時間／遊戲關主／submissionId」題（沒有對應 entry ID）。這三項寫進備註前三行，Apps Script 提交時解析後寫入 `_gameCompletedAt`、`_gameGatekeeper`、`_gameSubmissionId`。若之後用表單擁有者帳號加了獨立題，把新的 `entry.xxx` 放進 `GOOGLE_FORM_PREFILL_ENTRIES` 即可，不要猜 ID。

## 後台內建招生表

已登入夥伴可在 `/follow-up` 直接填完正式表單其餘題目（分級、活動、入社、保證金、備註、入社後的生日／學號／興趣），按「送出招生資料」。伺服器以管理員 session（`protect`／同源 POST）呼叫 Sheets API，**append** 一列到「招生狀況表」（gid `1921679351`），欄位對應 Google Form 回應列。技術欄 `_gameSubmissionId`、`_gameGatekeeper`、`_gameCompletedAt` 只加在最後，不刪既有欄。去重與表單提交相同：同一 `submissionId` 或同一正規化電話不重複寫入，並立刻從待跟進名單移除。

「打開正式招生表單」仍保留，給想繼續用 Google Form 的夥伴。遊戲路徑仍然只寫 gid `896311128`，不會寫「招生狀況表」或覆寫「總表」公式。

## 環境變數

新名稱優先，舊名稱後備：

- `GOOGLE_GAME_SHEET_TAB` → 後備 `GOOGLE_SHEET_TAB` → 預設 `09/` + `14後玩遊戲`（sheetId 896311128）
- `GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB` → 後備 `GOOGLE_FORM_SHEET_TAB`（僅舊 dashboard 表單讀取）→ 招生戰情預設 `招生狀況表`
- `GOOGLE_RECRUITMENT_MASTER_SHEET_TAB` → 預設 `總表`

正式站還需要：`GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_SHEET_ID`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`PUBLIC_ORIGIN`。不要使用 `VITE_` 前綴。

```
GOOGLE_GAME_SHEET_TAB=<09/ 接 14後玩遊戲，中間沒有空白>
GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB=招生狀況表
GOOGLE_RECRUITMENT_MASTER_SHEET_TAB=總表
GOOGLE_FORM_ID=12fk5ubMY0fnCSSTEljFJ1l-gcao1hDMkw7F8I8qTlOw
GOOGLE_FORM_RESPONDER_URL=https://docs.google.com/forms/d/e/1FAIpQLSdzbqD9Bq4qaRu5HVfUS-pTNLSKiFcmGNs72w2lWuZ9u6TE7A/viewform
```

可選 `GOOGLE_FORM_PREFILL_ENTRIES`（JSON，合併進內建 live map）。沒設時仍用上表 entry ID 產生 PREFILL。

`/follow-up` 與 `/api/admin/recruitment` 都要有效管理員 session。個資不會出現在公開 API。

## Apps Script

目錄：`google-apps-script/recruitment-form-sync/`

這步需要**表單／試算表擁有者 Google 帳號**，不阻擋 app 內預填與候選名單：

1. 用表單／試算表擁有者帳號建立 Apps Script（不要貼 service account JSON）
2. 先 `DRY_RUN=true`，執行 `validateRecruitmentFormStructure` 與 `planRecruitmentFormSync`
3. 確認不會刪既有招生題後，拿掉 DRY_RUN，執行 `rebuildGatekeeperSections` / `syncRecruitmentCandidates`
4. 執行 `installRecruitmentTriggers`：表單提交立即同步；每 5 分鐘再同步一次
5. Script Properties：`SPREADSHEET_ID`、`FORM_ID`

候選去重：同一人可有多局 `GameAttempt`，候選名單只留一個。已有有效招生狀況列（`_gameSubmissionId` **或**同一正規化電話）即從 `/follow-up` 名單移除。同名不同電話不合併。同步失敗時保留 last-known-good choices，app 也保留上次讀到的候選。

## 回滾

- 遊戲寫入：改回 `GOOGLE_SHEET_TAB` / 停用 `GOOGLE_GAME_SHEET_TAB`
- Apps Script：刪除 triggers，表單結構可從 `FORM_STRUCTURE_SNAPSHOT` 對照
- 不要還原或覆寫總表公式
