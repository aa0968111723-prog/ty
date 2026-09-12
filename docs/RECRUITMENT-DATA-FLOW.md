# 招生資料流

學生打開 ty → 選關主、填資料 → 15 秒練習（不寫入）→ 60 秒正式遊戲 → 以 `submissionId` 寫入 Google Sheet「09/14 後玩遊戲」分頁（gid `896311128`）→ Apps Script 依遊戲關主同步「2026招生狀況表單-上」待處理候選 → 夥伴提交後進入「招生狀況表」（gid `1921679351`，A:Q 既有欄位不變）→ 既有「總表」（gid `0`）公式自動整理 → 已登入的 `/admin` 招生戰情讀總表＋遊戲分頁＋招生狀況表。

ty 不是第二套招生真相。Google Sheets 與現有 Google Form 仍是招生工作流核心。

## 分頁

| 分頁 | sheetId | 用途 |
| --- | --- | --- |
| 總表 | 0 | 既有 LET / ARRAYFORMULA / FILTER / VSTACK，不要覆寫 |
| 茶會報名 | 107799715 | 活動報名，遊戲不寫入 |
| 招生狀況表 | 1921679351 | Google Form 目的地。技術欄只能加在最後 |
| 09/14 後玩遊戲 | 896311128 | 正式遊戲唯一寫入目標 |

程式用分頁標題；啟動 diagnostics 會再核對 sheetId。

## 環境變數

新名稱優先，舊名稱後備：

- `GOOGLE_GAME_SHEET_TAB` → 後備 `GOOGLE_SHEET_TAB` → 預設 `09/` + `14後玩遊戲`（sheetId 896311128）
- `GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB` → 後備 `GOOGLE_FORM_SHEET_TAB`（僅舊 dashboard 表單讀取）→ 招生戰情預設 `招生狀況表`
- `GOOGLE_RECRUITMENT_MASTER_SHEET_TAB` → 預設 `總表`

正式站還需要：`GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_SHEET_ID`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`PUBLIC_ORIGIN`。不要使用 `VITE_` 前綴。

建議新增（正式站目前若仍殘留 `GOOGLE_SHEET_TAB=國際生專區`，一定要另設遊戲分頁，不要讓正式成績寫進國際生專區）：

```
GOOGLE_GAME_SHEET_TAB=<sheetId 896311128 的分頁標題；程式預設為 09/ 接 14後玩遊戲，中間沒有空白>
GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB=招生狀況表
GOOGLE_RECRUITMENT_MASTER_SHEET_TAB=總表
GOOGLE_FORM_ID=12fk5ubMY0fnCSSTEljFJ1l-gcao1hDMkw7F8I8qTlOw
GOOGLE_FORM_RESPONDER_URL=https://forms.gle/CBmNvkcvSQMzvh9X7
```

可選 `GOOGLE_FORM_PREFILL_ENTRIES`（JSON，entry.xxx 對應姓名／電話／系級／關主）。沒有時，「填招生資料」打開原始表單連結，候選列已顯示姓名、電話、系級。

## Apps Script

目錄：`google-apps-script/recruitment-form-sync/`

1. 用表單／試算表擁有者帳號建立 Apps Script（不要貼 service account JSON）
2. 先 `DRY_RUN=true`，執行 `validateRecruitmentFormStructure` 與 `planRecruitmentFormSync`
3. 確認不會刪既有招生題後，拿掉 DRY_RUN，執行 `rebuildGatekeeperSections` / `syncRecruitmentCandidates`
4. 執行 `installRecruitmentTriggers`：表單提交立即同步；每 5 分鐘再同步一次
5. Script Properties：`SPREADSHEET_ID`、`FORM_ID`

候選去重：同一人可有多局 `GameAttempt`，Form 只出現一個 `RecruitmentCandidate`。已有有效招生狀況列（含 `_gameSubmissionId`）即移除。同名不同電話不合併。同步失敗時保留 last-known-good choices。

## 回滾

- 遊戲寫入：改回 `GOOGLE_SHEET_TAB` / 停用 `GOOGLE_GAME_SHEET_TAB`
- Apps Script：刪除 triggers，表單結構可從 `FORM_STRUCTURE_SNAPSHOT` 對照
- 不要還原或覆寫總表公式
