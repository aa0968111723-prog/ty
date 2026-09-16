# 招生戰情後台回報

給人類 compare / PR 用。樹內原本只有 `docs/RECRUITMENT-DATA-FLOW.md`，沒有這份回報。`PRODUCT_CONTRACT.md` 對照現況仍正確，本回合未改。未把 QA 截圖掃進 git。

| 項 | 值 |
| --- | --- |
| 日期 | 2026-09-16 |
| 觀察 | `2026-09-16T19:42:07Z` |
| 分支 | `cursor/admin-war-room-cf4c` |
| 產品 SHA | `a046eb089850a0544373f942cff7127fdb6e5fe0`（本文件加入前的 HEAD；local = origin） |
| 對照 `origin/main` | `d839e46e976916bd415d7d8200f466619b3623be`，ahead 44 |
| 此 head 的 GitHub PR | **無**。`gh pr list --head cursor/admin-war-room-cf4c` → `[]`；GitHub MCP `search_pull_requests` `head:cursor/admin-war-room-cf4c` → `total_count: 0` |
| 開放 PR（錯誤頭，不算完成） | #31 `cursor/recruitment-battleboard-12d7`、#32 `cursor/admin-command-center-3804`。不要 merge。 |
| Compare | GitHub repo `ty` 的 `main...cursor/admin-war-room-cf4c` |

未標 Goal complete。未發明無關 UI。未重試 MCP `create_pull_request`（403）/ `create_pull_request_with_copilot`（401）。未 ManagePullRequest。未加 Actions PR workflow。GitHub 訂閱仍為 `sub_a37f7f67-8a1b-4307-a676-1b7a85ba3f77`。

---

## 1. 修改過的檔案

`git diff --stat origin/main...a046eb0`：**35 files, +3318 / −1745**。

| 區 | 檔案 |
| --- | --- |
| 戰情 UI | `src/components/club/war-room.tsx`, `admin-shell.tsx`, `official-form-shortcuts.tsx`, `admin.css`, `src/routes/admin.tsx`, `admin-presentation.ts`, `admin-ranks.tsx`, `admin-login.tsx` |
| 夥伴流程 | `partner-picker.tsx`, `partner-state.ts`, `recruiter-quickfill.tsx`, `recruitment-dashboard.tsx`, `recruitment-profile-sheet.tsx` |
| 統計 / 預填 | `src/lib/club/recruitment.mjs`, `recruitment-prefill.mjs`, `recruitment-staff-form.mjs`, `recruitment-identity.mjs` |
| 測試 | `recruitment.test.mjs`, `recruitment-prefill.test.mjs`, `recruitment-staff-form.test.mjs`, `recruitment-identity.test.mjs`, `scripts/club-browser.test.mjs`, `frontend-sheets-guard.test.mjs` |
| 部署 | `Dockerfile`, `zbpack.json`, `.dockerignore`, `vite.config.ts`, `package.json` |
| 文件 / GAS | `PRODUCT_CONTRACT.md`, `docs/RECRUITMENT-DATA-FLOW.md`, `google-apps-script/recruitment-form-sync/Code.gs` |
| PWA | `public/manifest.webmanifest` |

#31 / #32 的頭未改。本文件是唯一新增回報。

---

## 2. IA

登入後預設 `recruitment`（`initialView()`）。`?view=pinned` 映射 `pinned`。首頁標題：**今日招生戰情**，主體 `<WarRoom>`。

四個主入口（`admin-shell.tsx` `primaryNav` + 更多）：

| 手機底欄 | 桌面 |
| --- | --- |
| 戰情 | 今日招生戰情 |
| 待處理 | 待處理 |
| 名單 | 名單 |
| 更多 | 更多 |

「更多」：今日排行榜、歷史排行榜、表單資料、同步狀態、系統設定；另有我的釘選、比賽成績。首頁不擠這些入口。

首頁接引人選擇 compact（`partner-picker is-compact`），KPI 先出現。Copy：**這位有緣人的接引人**。不自動帶入遊戲關主。

---

## 3. 視覺化

`.war-kpis` 六張卡：圖示 + SVG ring + 數字。點開 **NamePeek / WHO**（最多 6 個名字 +「還有 N 人」）。chip 只有 `{ name, personKey }`；`toPartnerRecruitmentDashboard` 把 `personKey` 做成 `who:` hash，電話不出 API。

六張卡：今日接觸、累積接觸、今日活動報名、入社、已繳保證金、**待填正式招生資料**。同步不是第七張 KPI，而是橫幅 `aria-label="資料同步狀態"`（遊戲 / 招生表 / 總表）。失敗文案「數字暫缺，不是 0 人」，KPI 用 —。

- 漏斗：遊戲接觸 → 活動報名 → 入社 → 保證金。缺欄「資料不足」。
- 各活動：CSS 長條，點開該場報名姓名。
- 近七日：接 / 報 / 社。
- 44px：`.admin-page button` min 44×44；底欄 52px；KPI hit 88px。`.admin-page { overflow-x: hidden }`。`@media (max-width: 719px)` 隱藏 roster table。
- `src/components` 不含「分級」或 S/A/B。`LIVE_TIER_ENTRY` 只在 server `recruitment-staff-form.mjs`。`generatePrefilledFormUrl` 不 `setEntry` 分級；`mergeEntries` 刪 `tier`。

---

## 4. 今日 / 累積（Asia/Taipei）

來源：`buildRecruitmentDashboard`（`recruitment.mjs`），經 `toPartnerRecruitmentDashboard` **server-side** 後才給 `/api/admin/recruitment`。官方局才計（`parseGameAttempts` 跳過 `kind !== "official"` 與 `skipSave`）。去重電話優先（`uniqueByIdentity` / `clusterGamePeople`）；同名不同電話不合併；碰撞 `ambiguous` → UI「需要確認」。姓名 NFKC（`normalizeName`）。

| UI | 欄位 | 定義 |
| --- | --- | --- |
| 今日接觸人數 | `summary.playedToday` | 今日完成官方遊戲的去重人數 |
| 累積接觸人數 | `summary.playedAll` | 全部官方遊戲去重人數 |
| 今日活動報名人數 | `summary.activityToday` | 今日正式表且有**真實活動**的去重人數 |
| 各活動報名人數 | `events[]` | 每場真實活動去重人數 + 姓名 |
| 入社人數 | `summary.joined` | 正式表「是否入社」= 是（缺欄 → —） |
| 已繳保證金 | `summary.depositPaid` | 正式表「保證金是否繳費」= 是 |
| 待填正式招生資料 | `summary.pending` | 玩過官方遊戲、尚未完成招生列 |
| 資料同步 | `sync.*` | 三份表連線旗標 |

KPI/events 不帶分數、分級、submissionId、原始電話。待處理列內部可有 `submissionId` 給身分比對，畫面不顯示。

---

## 5. 活動人數

`isCountedActivity`：空、`^無`、`考慮中` / `沒興趣` / `未報` → 不算報名。選項含 `無(考慮中`、`無(沒興趣`；後兩項不進長條。一人多場切開，每場各計一次去重。漏斗「活動報名」與近七日「報」同一謂詞。測試：`considering-none event options do not count as signups`。

重複提交：`parseGameAttempts` 同 `submissionId` 不第二列；`parseRecruitmentResponses` 標 `duplicate` 後 `filter(!row.duplicate)`；staff `recruitmentResponseDuplicate` 用 submissionId 或電話。測試：`same submission processed twice is duplicate and does not create a second student`。

---

## 6. 夥伴流程

1. 選「這位有緣人的接引人」（`partner-picker.tsx`）。**不會**覆蓋遊戲關主。卡片寫「遊戲關主 … · 正式招生接引人 …」。
2. 待處理：填寫正式資料、開啟表單、標記已處理、查看詳細資料。
3. `/follow-up` 預填姓名 / 電話 / 系級 / 接引日期；備註只有「遊戲完成」+「遊戲關主」（`buildGameMetadataNote`）。
4. 夥伴題是「這位同學報名了哪個活動？」，不是分級。
5. 「開啟正式招生表單」= published `/viewform`。`OfficialFormShortcuts` 在更多、表單資料、待處理詳細資料。`查看招生表單後台` = 同一張表 `/edit`。沒有重建 Form。
6. `encodeStudentChoice` 只寫 `|#p:`，**不寫** `|#s:`。`submissionId` 不進備註、不進選擇學生、不進 prefill URL。舊 Sheet 若仍有 `submissionId：` / `#s:` 仍可解析並從可見備註剝掉。

---

## 7. 測試 / gates（產品 SHA `a046eb0`；本回合補 Phase-8 測試）

日誌在本回合產物，不進 git。先前寫「沒有發現未修的 spec 洞」已過時：客觀點名的四洞裡，空資料 / 同步失敗 / 重複提交 的 dashboard 斷言太弱或缺失，本回合已補。今日/歷史（Taipei）既有測試已足夠，未再加一筆。

本回合新增 / 加強（`src/lib/club/recruitment.test.mjs`）：

| 洞 | 測試名 | 斷言 |
| --- | --- | --- |
| 空資料 | `empty sheets…` 加強；`空資料: blank form fields are 資料不足, not 0 people` | 空遊戲表接觸=0（真的沒人）；空白入社/活動/保證金欄 → null / funnel `missing`，不是 0 |
| 同步失敗 | `同步失敗: failed empty sheets are 資料不足, not zeros`；`同步失敗: stale last-known-good still shows people, not a fake zero` | 失敗且無 last-known-good → played/pending null、漏斗 資料不足；stale 列仍顯示人數 |
| 重複提交 | `重複提交: same game submissionId does not create a second row`；`重複提交: flagged duplicate recruitment row does not create a second student` | 同 submissionId 只留一列；`_duplicate` 招生列不第二人 |
| 今日/歷史 | **未新增** | 既有 `today vs history contacts exclude practice…` 與 `war-room today vs history contacts use Asia/Taipei midnight, not UTC` |

`node --test src/lib/club/recruitment.test.mjs scripts/club-admin.test.mjs`：38 pass / 0 fail。`node --test src/lib/club/*.test.mjs`：121 pass / 0 fail。未重跑完整 live 16 項。

未跑全量 `npm test` / typecheck / build（只動測試與同步失敗空表的 missing 計數；KPI 對 null 顯示 —）。

| Gate（上一份回報，產品 `a046eb0`） | 結果 |
| --- | --- |
| `npm run typecheck` | pass（`tsc --noEmit`） |
| `npm test` | 361 pass / 0 fail / 1 skip（`official game completion writes the game sheet immediately`）+ typed 55 pass / 0 fail |
| `npm run lint` | 0 errors / 13 warnings |
| `npm run build` | pass；client `admin-kJvX4yw0.js` |
| club-browser | 17 pass / 0 fail |
| prod smoke | desktop+mobile 200，無 console/page error，`horizontalOverflow: false` |

---

## 8. 部署（本回合觀察一次，未 restore）

| 項 | 值 |
| --- | --- |
| 服務 | `leader-dna-sheet-sync` RUNNING |
| GitTrigger | **`cursor/admin-war-room-cf4c`**（repoID 1363866270） |
| RUNNING | `a046eb089850a0544373f942cff7127fdb6e5fe0` `refs/heads/cursor/admin-war-room-cf4c`（created `2026-09-16T19:27:18.983Z`） |
| Live | `/admin` `/follow-up` `/leaderboard?scope=today` `/` 皆 200 |
| Live JS | `/assets/admin-kJvX4yw0.js`（與 `a046eb0` build 同檔名） |
| Fingerprint | `war-kpis=1` `battle-kpis=0` `分級=0` `1322037614=0` `googleapis=0` `forms.create=0` `今日招生戰情=4` `需要確認=3` |

未 `deploy(gitRef)` / zip。觀察時 GitTrigger 與 RUNNING 已是本頭，因此未 `deployFromSpecification`。

Clasp：`google-apps-script/recruitment-form-sync/` **沒有** `.clasp.json`。Apps Script **未**部署。不阻擋 app 內預填與戰情。

---

## 9. 還缺什麼（Goal 保持 open）

1. **人類必須開 PR**。請有 repo write 的人用上面的 compare 開 PR，標題「招生戰情後台：手機一眼看懂、夥伴快速填表」，draft 可。不要再開會嘗試 MCP / `gh pr create` / Actions。
2. **#31 / #32 不要當這個 goal 的 PR**，也不要 merge。
3. **Apps Script / clasp 僅擁有者** — 樹內有 GAS，**沒有** `.clasp.json`。Clasp **未**部署。不假裝已同步表單候選。

Live 戰情在觀察當下仍是產品 SHA `a046eb0`（GitTrigger cf4c + RUNNING 該 commit + `admin-kJvX4yw0.js` + `war-kpis`、無分級）。Goal 仍 open，直到這個 head 有一張真實 GitHub PR **且** live 仍吻合。
