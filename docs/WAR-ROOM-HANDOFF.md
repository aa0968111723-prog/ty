# 招生戰情後台回報

給人類 compare / PR 用。樹內原本只有 `docs/RECRUITMENT-DATA-FLOW.md`，沒有這份回報。`PRODUCT_CONTRACT.md` 對照現況仍正確，本回合未改。未把 QA 截圖掃進 git。

| 項 | 值 |
| --- | --- |
| 日期 | 2026-09-16 |
| 觀察 | 本文件寫入時；live 指紋見第 8 節（本回合 GitTrigger `2026-09-16T23:22:56Z`、JS `2026-09-16T23:23:04Z`、live badges `2026-09-16T23:25:30Z`） |
| 分支 | `cursor/admin-war-room-cf4c` |
| 產品 SHA | `b43bb20db696593097f9c0429ebbfeb1f199fcef`（identity status 進夥伴 JSON；eslint 0/0；live JS 仍 `admin-BV6x7ajA.js`，與 `89c24c0` client 同檔） |
| 對照 `origin/main` | `d839e46e976916bd415d7d8200f466619b3623be`，ahead 55、behind 0（未 rebase） |
| 此 head 的 GitHub PR | **無**。`gh pr list --head cursor/admin-war-room-cf4c` → `[]`。`GET /commits/b43bb20/pulls` 與 `/commits/89c24c0/pulls` → `[]`。GraphQL `associatedPullRequests` 兩 SHA 皆空。`GET /commits/HEAD/pulls` 是 **main** 的 #30（他頭 `cursor/admin-war-room-ia-8323`），不算這個 head。 |
| 開放 PR（錯誤頭，不算完成） | #31 `cursor/recruitment-battleboard-12d7`、#32 `cursor/admin-command-center-3804`。不要 merge。 |
| Compare | GitHub repo `ty` 的 `main...cursor/admin-war-room-cf4c` |

未標 Goal complete。未發明無關 UI。未 ManagePullRequest。未加 Actions PR workflow。未 `gh pr create`。未 POST `/pulls`。未重試 MCP `create_pull_request`（已知 403）。跳過 Copilot PR。未 poll。未 clasp 部署。未 `deploy(gitRef)` / zip。本回合未重跑 16 項 DOM tour。

---

## 1. 修改過的檔案

`git diff --stat origin/main...b43bb20`：**40 files, +4210 / −1811**。

| 區 | 檔案 |
| --- | --- |
| 戰情 UI | `src/components/club/war-room.tsx`, `admin-shell.tsx`, `official-form-shortcuts.tsx`, `admin.css`, `src/routes/admin.tsx`, `admin-presentation.ts`, `admin-ranks.tsx`, `admin-login.tsx` |
| 夥伴流程 | `partner-picker.tsx`, `partner-state.ts`, `recruiter-quickfill.tsx`, `recruitment-dashboard.tsx`, `recruitment-profile-sheet.tsx` |
| 統計 / 預填 / 下一筆 | `src/lib/club/recruitment.mjs`, `recruitment-prefill.mjs`, `recruitment-staff-form.mjs`, `recruitment-identity.mjs`, `next-pending.mjs` |
| 測試 | `recruitment.test.mjs`, `recruitment-prefill.test.mjs`, `recruitment-staff-form.test.mjs`, `recruitment-identity.test.mjs`, `next-pending.test.mjs`, `scripts/club-browser.test.mjs`, `frontend-sheets-guard.test.mjs`, `club-admin.test.mjs`, `recruitment-form-sync.test.mjs`, `admin-dashboard-pwa.test.mjs` |
| 部署 | `Dockerfile`, `zbpack.json`, `.dockerignore`, `vite.config.ts`, `package.json` |
| 文件 / GAS | `PRODUCT_CONTRACT.md`, `docs/RECRUITMENT-DATA-FLOW.md`, `docs/WAR-ROOM-HANDOFF.md`, `google-apps-script/recruitment-form-sync/Code.gs` |
| PWA | `public/manifest.webmanifest` |

#31 / #32 的頭未改。

產品線上此 head 的關鍵提交：

| SHA | 做了什麼 |
| --- | --- |
| `a046eb0` | 正式表單捷徑 390 不在字中間斷行 |
| `cee7bfd` | 空資料 / 同步失敗 / 重複提交：KPI／漏斗用 —／資料不足，不是假 0 |
| `26584f4` | 失敗空表不再把各活動長條、近七日走勢畫成 0 |
| `cf2831c` | 戰情首頁「現在先填這位」卡：下一筆待填姓名 + CTA「填寫正式資料」。遊戲關主不當接引人 |
| `545c79a` | next-person / ranking typecheck |
| `fb6034d` | 首頁 compact 接引人用 `<select>`，next-person 測試選關主後人不變 |
| `4064dfb` | 回報寫到 `fb6034d`（含「現在先填這位」） |
| `89c24c0` | 戰情相關檔案 eslint **0 errors / 0 warnings** |
| `b43bb20` | `toPartnerRecruitmentDashboard` 把 `status` 留在 pending/roster，live 才畫得出「需要確認」徽章 |

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

首頁接引人選擇 compact（`partner-picker is-compact` 的 `<select>`），KPI 先出現在卡下方。Copy：**這位有緣人的接引人**。不自動帶入遊戲關主。選了關主當接引人後，文案仍是「遊戲關主另計」。

首頁同步橫幅與 compact 接引人下面有 **「現在先填這位」**（`.war-next`）。優先已指定給這位夥伴的正式接引人，其次尚未指定；**從不**用遊戲關主排名。CTA：**填寫正式資料**（`min-height: 44px`，首屏、底欄之上）。六張 KPI（含 **待填正式招生資料**）仍在卡下方。

---

## 3. 視覺化

`.war-kpis` 六張卡：圖示 + SVG ring + 數字。點開 **NamePeek / WHO**（最多 6 個名字 +「還有 N 人」）。chip 只有 `{ name, personKey }`；`toPartnerRecruitmentDashboard` 把 `personKey` 做成 `who:` hash，電話不出 API。

六張卡：今日接觸、累積接觸、今日活動報名、入社、已繳保證金、**待填正式招生資料**。同步不是第七張 KPI，而是橫幅 `aria-label="資料同步狀態"`（遊戲 / 招生表 / 總表）。失敗文案「數字暫缺，不是 0 人」，KPI 用 —。

- 漏斗：遊戲接觸 → 活動報名 → 入社 → 保證金。缺欄「資料不足」。
- 各活動：CSS 長條，點開該場報名姓名。表單來源不可用（失敗且無 last-known-good 列）→ **不畫長條**，改「活動人數暫缺，不是沒有人報名」。
- 近七日：接 / 報 / 社。遊戲＋表單皆不可用 → **不畫走勢**，改「近七日走勢暫缺」。
- 44px：`.admin-page button` min 44×44；底欄 52px；KPI hit 88px；`.war-next .admin-primary` 44px。`.admin-page { overflow-x: hidden }`。`@media (max-width: 719px)` 隱藏 roster table。
- `src/components` 不含「分級」或 S/A/B。`LIVE_TIER_ENTRY` 只在 server `recruitment-staff-form.mjs`。`generatePrefilledFormUrl` 不 `setEntry` 分級；`mergeEntries` 刪 `tier`。

---

## 4. 今日 / 累積（Asia/Taipei）

來源：`buildRecruitmentDashboard`（`recruitment.mjs`），經 `toPartnerRecruitmentDashboard` **server-side** 後才給 `/api/admin/recruitment`。官方局才計（`parseGameAttempts` 跳過 `kind !== "official"` 與 `skipSave`）。去重電話優先（`uniqueByIdentity` / `clusterGamePeople`）；同名不同電話不合併；碰撞 `ambiguous` → UI「需要確認」。姓名 NFKC（`normalizeName`）。

| UI | 欄位 | 定義 |
| --- | --- | --- |
| 今日接觸人數 | `summary.playedToday` | 今日完成官方遊戲的去重人數 |
| 累積接觸人數 | `summary.playedAll` | 全部官方遊戲去重人數 |
| 今日活動報名人數 | `summary.activityToday` | 今日正式表且有**真實活動**的去重人數 |
| 各活動報名人數 | `events[]` | 每場真實活動去重人數 + 姓名；表單不可用時陣列為空 |
| 入社人數 | `summary.joined` | 正式表「是否入社」= 是（缺欄 → —） |
| 已繳保證金 | `summary.depositPaid` | 正式表「保證金是否繳費」= 是 |
| 待填正式招生資料 | `summary.pending` | 玩過官方遊戲、尚未完成招生列 |
| 資料同步 | `sync.*` | 三份表連線旗標 |

KPI/events 不帶分數、分級、submissionId、原始電話。待處理列內部可有 `submissionId` 給身分比對，畫面不顯示。夥伴 JSON 用 `partnerCount`：`null` 保持 `null`，不收成 `0`。

---

## 5. 活動人數

`isCountedActivity`：空、`^無`、`考慮中` / `沒興趣` / `未報` → 不算報名。選項含 `無(考慮中`、`無(沒興趣`；後兩項不進長條。一人多場切開，每場各計一次去重。漏斗「活動報名」與近七日「報」同一謂詞。測試：`considering-none event options do not count as signups`。

重複提交：`parseGameAttempts` 同 `submissionId` 不第二列；`parseRecruitmentResponses` 標 `duplicate` 後 `filter(!row.duplicate)`；staff `recruitmentResponseDuplicate` 用 submissionId 或電話。測試：`same submission processed twice is duplicate and does not create a second student`。

失敗空表：`formUnavailable`（招生表＋總表 `sourceUnavailable` 且無 formal 列）→ `events = []`、近七日整段不輸出。測試：`同步失敗: failed empty sheets are 資料不足, not zeros` 斷言 `events.length === 0` 與 `trend.length === 0`。瀏覽器：`failed empty sheets show 資料不足, not event zeros`。

---

## 6. 夥伴流程

1. 選「這位有緣人的接引人」（`partner-picker.tsx`）。**不會**覆蓋遊戲關主。卡片寫「遊戲關主 … · 正式招生接引人 …」。
2. 首頁「現在先填這位」（`next-pending.mjs`）：只看正式 `recruiterList` / `recruiters`，**忽略** `gameGatekeeper`。Live 16 當時：陳柏能、尚未指定接引人、遊戲關主 振泰；把接引人改成振泰後人仍是陳柏能、reason 仍 `unassigned`。
3. 待處理：填寫正式資料、開啟表單、標記已處理、查看詳細資料。
4. `/follow-up` 預填姓名 / 電話 / 系級 / 接引日期；備註只有「遊戲完成」+「遊戲關主」（`buildGameMetadataNote`）。
5. 夥伴題是「這位同學報名了哪個活動？」，不是分級。
6. 「開啟正式招生表單」= published `/viewform`。`OfficialFormShortcuts` 在更多、表單資料、待處理詳細資料。`查看招生表單後台` = 同一張表 `/edit`。沒有重建 Form。
7. `encodeStudentChoice` / GAS `recruitEncodeChoice_` 只寫 `|#p:`，**不寫** `|#s:`。`submissionId` 不進備註、不進選擇學生、不進 prefill URL。舊 Sheet 若仍有 `submissionId：` / `#s:` 仍可解析並從可見備註剝掉。

---

## 7. 測試 / gates（產品 SHA `b43bb20`，本回合重跑）

日誌在產物，不進 git。`b43bb20` 改了 `recruitment.mjs`（status 進夥伴 JSON）與測試，因此本回合重跑 typecheck / lint / test / build 與 preview smoke。未重跑 16 項 DOM tour（沒有新洞）。

| Gate | 結果 |
| --- | --- |
| `npm run typecheck` | pass（`tsc --noEmit`，EXIT 0） |
| `npm test` | 375 pass / 0 fail / 1 skip + typed 55 pass / 0 fail |
| `npm run lint` | **0 errors / 0 warnings**（`eslint . --max-warnings 0`，EXIT 0） |
| `npm run build` | pass；client `admin-BV6x7ajA.js`（65 241 B，sha256 `7018a9cd414e`，與 live 同檔） |
| preview smoke | dev `8080` 與 built `8081` 皆有內容、console 乾淨；`divergesFromBaseline: false` |
| This-turn live 16 @ `89c24c0` / `admin-BV6x7ajA.js` | 先前 **16/16 pass**（`2026-09-16T22:30:09Z`）。本回合 client chunk 未變，未重跑。 |

Skip 是 `official game completion writes the game sheet immediately # SKIP`（沙盒不寫 live sheet），不是產品洞。

---

## 8. 部署（本回合觀察，未 restore）

| 項 | 值 |
| --- | --- |
| 服務 | `leader-dna-sheet-sync` RUNNING |
| GitTrigger | **`cursor/admin-war-room-cf4c`**（repoID 1363866270）。未被偷走。 |
| RUNNING | `6aab228805af289f92f97c68` @ **`b43bb20db696593097f9c0429ebbfeb1f199fcef`** `refs/heads/cursor/admin-war-room-cf4c`（created `2026-09-16T23:13:12.1Z`，finished `23:15:11.049Z`） |
| Live | `/admin` 200；戰情 / 待處理 / 名單可登入 |
| Live JS | `/assets/admin-BV6x7ajA.js`（65 241 B，sha256 `7018a9cd414e`；與本 SHA production client 同檔） |
| Fingerprint（admin JS） | `war-kpis=1` `battle-kpis=0` `分級=0` `googleapis=0` `forms.create=0` `1322037614=0` `待填正式招生資料=1` `現在先填這位=4` `data-next-pending=1` **`需要確認=2`** `submissionId=1`（僅備註剝離 regex，畫面 0）`#s:=0` |
| Live badges | 戰情橫幅 **「7 筆需要確認，不會自動合併。」**；待處理 exact **需要確認=5**（`.admin-badge.is-confirm` 五枚）；陳柏能兩張待處理卡皆 **需要確認**（0986968111 / 0955229050）；名單 exact **需要確認=7**。夥伴 JSON `status` 有值（pending ambiguous 5 / matched 42）。畫面 **無** `submissionId`。 |

未 `deploy(gitRef)` / zip。GitTrigger 仍是本分支、RUNNING 已是產品頭，因此未 `deployFromSpecification`。本文件若只改回報，push 後 GitTrigger 可自動 build 該 docs commit；不要 poll。

Clasp：`google-apps-script/recruitment-form-sync/` **沒有** `.clasp.json`。樹內 `Code.gs` 已不把 `submissionId` 寫進備註或選擇學生（legacy `#s:` / `submissionId：` 只解碼）。Apps Script **未** clasp 部署。不阻擋 app 內預填與戰情。不假裝 clasp 已部署。

---

## 9. 還缺什麼（Goal 保持 open）— remaining：PR + clasp

1. **人類必須開 PR**。請有 repo write 的人用上面的 compare 開 PR，標題「招生戰情後台：手機一眼看懂、夥伴快速填表」，draft 可。不要用 `gh pr create` / Actions。不要再試 MCP `create_pull_request`（PAT 403）。
2. **#31 / #32 不要當這個 goal 的 PR**，也不要 merge。
3. **Apps Script / clasp 僅擁有者** — 樹內有 GAS，**沒有** `.clasp.json`。Clasp **未**部署。不假裝已同步表單候選。

Live 戰情本回合是產品 SHA `b43bb20`（GitTrigger cf4c + RUNNING 該 commit + `admin-BV6x7ajA.js` + `war-kpis` + **現在先填這位** + **需要確認 live badges**、`分級=0`、畫面無 submissionId）。Goal 仍 open，直到這個 head 有一張真實 GitHub PR **且** live 仍吻合。未 UpdateGoal complete。
