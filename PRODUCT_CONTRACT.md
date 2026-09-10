# 產品契約：淡江大學社團博覽會 60 秒專注力挑戰賽

此專案永遠只是「社博現場 60 秒專注力挑戰遊戲」。禁止改造成聊天、會員、CRM、問卷或多遊戲平台。

## 正式流程

掃 QR / 打開網址 → 首頁理解活動 → 填姓名、科系、年級、電話 → 開始 → 60 秒 Stroop → 分數／正確率／連擊／稱號 → 可寫入成績（給攤位）→ 可再挑戰。

不收集電子信箱。試玩不登記、不抽獎。前五名與手搖杯得獎不在網站公開，由現場公布。

## 遊戲規則

- 中央文字字義與視覺顏色永遠不同
- 模式：【字面意思】或【視覺顏色】
- 答對 +100；連擊 ≥5 時 +200；答錯 −50，最低 0
- 約每 3 秒或連續答對達切換條件時改模式
- 正式賽總時間 60 秒（依牆鐘，背景分頁不可延長）
- 報名頁可改時間（30/45/60/90 秒）、切換速度、起始規則、音效與震動。改過設定的是練習局，不登記抽獎。

## 稱號

- Lv.1 心靈修煉者（0+）
- Lv.2 潛力領袖（1500+）
- Lv.3 穩定領航者（2500+）
- Lv.4 卓越領袖（3500+）

稱號只描述這次 60 秒的專注表現，不是人格測驗。

## 語言與中文輔助

- The default interface language is English.
- An `EN / 中文` switcher is available on the registration, settings, game, and result screens.
- English mode keeps concise Traditional Chinese helper text beside key instructions and fields.
- Department, grade, and registration values continue to use the existing internal format so the booth registration and prize-draw workflow remain compatible.

## API

`/api/health` `GET`、`/api/register` `POST`、`/api/result` `POST`、`/api/leaderboard` `GET`

網站不公開排行榜。`/api/leaderboard` 不回傳姓名或分數。成績只寫入現場表單給攤位使用。

## 部署

Canonical：TanStack Start，`npm run dev` 綁定 0.0.0.0:8080。正式站用同一套 `/api/*`。Google Sheet / SMTP 為選用，掛掉時遊戲仍可玩。
