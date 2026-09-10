# Emily LIFF 健康追蹤

LINE LIFF 每日狀態記錄與群組分享小程式。完整設計請見 [`docs/LINE_LIFF_Health_Tracker_Plan.md`](docs/LINE_LIFF_Health_Tracker_Plan.md)。

## 技術

Nuxt 4（SPA，`ssr: false`）+ Tailwind CSS + Nitro server routes + Supabase + Vercel，TypeScript / pnpm。

## 已完成

- 共用型別 `shared/types/record.ts`（前後端共用，改選項只需改這裡）
- Flex Message 產生器 `shared/utils/flexMessage.ts`
- API：`POST /api/records`、`GET /api/records/me`、`POST /api/line/webhook`、`GET /api/cron/daily-reminder`
- 前端：記錄表單 `/`、歷史趨勢 `/history`、`useLiff()` composable
- 資料庫 schema `supabase/schema.sql`

## 尚待設定（需要你的帳號）

1. **Supabase**：建立專案 → SQL Editor 執行 `supabase/schema.sql` → 取得 Project URL 與 service_role key。
2. **LINE Developers**：
   - 建立 **Messaging API Channel**：取 Access Token 與 Channel Secret，開啟 `Allow bot to join group chats`，關閉自動回覆。
   - 建立 **LINE Login Channel**（LIFF 掛在這底下，不是 Messaging API Channel）：取 Channel ID。
   - 在 Login Channel 設定 **Linked LINE Official Account** 連到上面的 Messaging API Channel，否則 `chat_message.write` 無效。
   - 建立 LIFF：Size `Tall`，Scopes 勾 `profile` / `openid` / `chat_message.write`，Endpoint 填 Vercel 網址。
3. **Vercel**：匯入 repo，填入下方環境變數。
4. 把 `<Vercel 網址>/api/line/webhook` 填進 Messaging API Channel 的 Webhook URL 並啟用。

## 環境變數

複製 `.env.example` 為 `.env`（本機）並在 Vercel 專案設定同樣的變數。
只有 `NUXT_PUBLIC_` 開頭的會進到瀏覽器，其餘一律僅存在 server 端。

`NUXT_CRON_SECRET` 可用 `openssl rand -hex 32` 產生。

## 開發

```bash
pnpm install
pnpm dev          # 本機開發（需搭配 ngrok 等 HTTPS 通道才能綁 LIFF Endpoint）
pnpm build        # 建置
pnpm dlx nuxi typecheck   # 型別檢查
```

## 設計上的關鍵限制

- **只有從群組點開 LIFF 才能分享到群組。** `liff.sendMessages()` 只能發回「開啟它的那個聊天室」，從圖文選單開啟時 context 是一對一聊天。因此每天上午推播到群組的提醒訊息，本身就是分享入口；圖文選單路徑定位為補填／修改，不分享。
- **日期一律由後端以 `Asia/Taipei` 決定。** Vercel 執行環境是 UTC，前端傳來的日期不採信。
- **身分一律由後端驗證 ID Token 取得。** 前端不傳 userId，API 是公開端點。
- **`liver_score` 由後端依 `liverCare` 計算**，不接受前端傳入。
- **併發靠資料庫。** `records` 上的 `unique (record_date, user_id)` 讓重複送出走 upsert，不需應用層鎖。
