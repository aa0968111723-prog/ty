# English interface audit — ty

Agent: ty English × live-site compare × continuous fix  
Product: Tamkang University Zen Club · Club Expo 60-second Focus Challenge  
Do not convert this product.

## Loop state

- Status: **round 1 complete — wait for next run**
- Stop requested: no
- MARKETING_COPY_INPUT: waiting for user-provided English promotional copy

## Round 1 — 2026-09-11

### Source of truth

| Item | Value |
| --- | --- |
| Repo | https://github.com/aa0968111723-prog/ty |
| Branch | main |
| Commit SHA | `29e927bbae34103e98fe896d6e320f09ac4f85ed` |
| Latest commit | `feat: expand Chinese helper labels for settings` |
| AGENTS.md | read |
| PRODUCT_CONTRACT.md | read |
| Other agents since last audit | first audit; last 10 commits are bilingual UI work on this repo |
| Live URL | https://focus-quest-2026.tcgs910338.chatgpt.site/ |

### Live vs source

**deployment lag (P1): live site is not this repository.**

Live homepage is a different product:

- Brand: **FOCUS QUEST** / 大學生專注力冒險
- Title on page: **專注力冒險挑戰**
- Extra required field: **今天為你服務的關主是誰？**
- Flow: 10-second practice + 60-second official
- No EN / 中文 switcher visible on the homepage
- Interface is Chinese-first, not English-default
- Form fields: 學校／社團, 姓名, 科系／年級, 聯絡電話, 關主姓名
- CTA: 開始練習與挑戰

Source (`29e927bb`) is:

- Brand: **Focus Challenge** / 專注力挑戰賽
- Host: Tamkang University Zen Club · Club Expo
- Fields: Name, Department, Year, Mobile number
- Guest path: Try without registering (no prize draw)
- EN / 中文 switcher on register, settings, game, result
- Default language: English, `document.documentElement.lang` set to `en` or `zh-Hant`

Do **not** revert source to match the old live site.

### Comparison table

| Item | Source expected | Live English | Live Chinese | Status |
| --- | --- | --- | --- | --- |
| Homepage title | Focus Challenge | not present | 專注力冒險挑戰 | P1 deployment lag |
| Language switch | EN / 中文 | not found | not found | P1 deployment lag |
| Register fields | Name, Department, Year, Mobile number | n/a | 學校／社團, 姓名, 科系／年級, 電話, 關主 | P1 different product |
| Settings | Challenge settings | not opened (wrong app) | not this app | blocked by lag |
| Game instructions | Word meaning / Ink color | not this app | 先看任務 / 再做選擇 / 答對才換任務 | P1 |
| Result page | Accuracy, Best combo, Correct, Wrong + titles | not this app | not verified | blocked by lag |
| Guest / practice | Try without registering (no prize draw) | not present | 開始練習與挑戰 (10s + 60s) | P1 |
| html lang | en default, zh-Hant after toggle | not verified as source app | page is Chinese UI | P1 |
| Images | campus hero + turtle | illustrated campus hero loads | loads | live images OK for *that* app |
| Horizontal overflow desktop | n/a source | none seen | none seen | live layout OK for *that* app |

### Source English review (code-only, not live)

Reviewed `src/routes/index.tsx`, `__root.tsx`, `src/lib/og/site.json`.

Fixed glossary present and consistent:

- Focus Challenge, Official Entry, Practice (guest path), Time left, Score, Combo
- Word meaning, Ink color
- Accuracy, Best combo, Correct, Wrong
- Challenge settings, Restore official rules
- Try again, Back to start
- Tamkang University Zen Club, Club Expo, Mobile number

No P0/P2 source copy bugs confirmed this round. Did **not** rewrite strings.

Notes (watch next round, do not change yet):

- Grade `博士班` English is `Doctoral` vs `Master's` for 碩士班 — slightly uneven, not broken.
- `延畢` = `Extended study` is acceptable; official campus English sometimes uses “extended study year”.
- `html lang` starts as `en` in `__root.tsx` and is updated in an effect. Correct for default English.
- `joinCopy` is in-app booth copy, not new marketing slogans. MARKETING_COPY_INPUT still waiting.

### Live browser checks (wrong app, still recorded)

- Desktop 1920×900: page renders, images load, no obvious overflow.
- Mobile 390×844: captured; Chinese UI remains primary.
- Did **not** submit a real registration.
- Could not exercise source EN/中文, settings, official 60s, result, try-again on the live host because that host is not the ty app.
- Console: no uncaught errors observed in the captured session.

### Build / typecheck / lint this round

**Not run.** No source change. Environment here is an audit sandbox, not the App Builder `/workspace` preview. Next round that edits `src/` must run typecheck, lint, and production build before commit.

### Fixes shipped this round

None. Rule: do not invent diffs when the confirmed issue is deployment lag.

### Open items

1. **deployment lag** — publish `29e927bb` (or later main) to the official URL, or point the official URL at this repo’s deployment.
2. MARKETING_COPY_INPUT still empty.
3. After live matches main, re-run full English + flow QA on the real app (guest path only).

### Next round must

1. `git fetch` and confirm HEAD.
2. Re-open the live URL.
3. If live still shows FOCUS QUEST / 關主欄位, keep status = deployment lag and do not revert source.
4. If live shows Focus Challenge + EN/中文, continue string and flow QA.
