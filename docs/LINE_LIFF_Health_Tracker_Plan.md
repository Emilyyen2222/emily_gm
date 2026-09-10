# LINE LIFF 狀態追蹤與社交分享小程式 - 專案開發計畫

## 專案概述
一個低阻力的日常狀態追蹤工具。讓使用者在 LINE 內部快速（10 秒內）記錄每日睡眠、健康與「肝臟養生」狀態，並能以 Flex Message 形式分享至 LINE 群組，達到互相監督與社交互動的效果。

## 技術選型

| 層級 | 選用 | 理由 |
|---|---|---|
| 前端框架 | **Nuxt 4**（SPA 模式，`ssr: false`） | LIFF SDK 依賴瀏覽器環境，且全站都在 LINE 登入後才有意義，SSR 無效益 |
| 樣式 | **Tailwind CSS**（`@nuxtjs/tailwindcss`），純手刻不引元件庫 | UI 元件少，手刻最能控制觸控尺寸與視覺調性，無額外套件負擔 |
| 後端 API | **Nuxt Nitro server routes**（`server/api/**`） | 與前端同一專案同一語言，型別共用；API 同源，**完全不需處理 CORS** |
| 資料庫 | **Supabase (Postgres)** | 唯一鍵 upsert 原生解決併發覆蓋；歷史趨勢查詢容易 |
| 部署 | **Vercel** | Nuxt 零設定部署，環境變數與 Cron 內建 |
| 語言／工具 | **TypeScript + pnpm** | 表單欄位多，型別可擋掉大量改欄位時的漏改 |
| 介接 API | LINE Messaging API（推播）、LINE Login `verify`（ID Token 驗證） | |

### 選型決策紀錄

*   **不使用 Python / FastAPI（已評估後排除）：** 前端既然是 Nuxt，TypeScript 無論如何都要寫，另外拉一個 FastAPI 服務等於同時維護兩種語言、兩個 repo、兩套部署，而非減少一種。此外 FastAPI 是常駐伺服器架構，在 Render / Railway 免費方案閒置約 15 分鐘會休眠，下一個請求需等 30～50 秒喚醒 —— 這會直接違背「10 秒內完成」的目標，且可能造成 LINE Webhook timeout 而漏接 `join` 事件、拿不到 `groupId`。Vercel 的 serverless 沒有休眠概念，此問題不存在。
    *   保留條件：若日後專案長出資料分析或建模需求，屆時再拆出獨立 Python 服務是合理的。
*   **不使用 UI 元件庫：** 本專案 UI 元件少（分數按鈕、多選 chip、emoji 選擇、趨勢頁），手刻最能控制觸控尺寸與視覺調性。
*   **不使用圖表庫：** 趨勢頁資料點僅 7～30 個，以 Tailwind + CSS/SVG 長條呈現即可。

### 資料流概觀
```
[Vercel Cron 00:00 UTC = 08:00 台北] --> [/api/cron/daily-reminder]
                                              |
                                     push message 至 LINE 群組
                                              v
                                     使用者點擊 LIFF 連結
                                              v
[Nuxt SPA 表單] --POST /api/records (同源, 帶 idToken)--> [Nitro server route]
                                                                |
                                              verify idToken -> Supabase upsert
                                                                v
[前端收到成功回應] --liff.sendMessages()--> [以使用者名義發 Flex Message 回原群組]
                                                                |
                                                        liff.closeWindow()

[LINE 群組 join / message 事件] --webhook--> [/api/line/webhook] --> 記錄 chat 至 Supabase
```

---

## 核心功能與資料結構

### 1. 紀錄項目 (表單欄位)
*   **睡眠狀態：** 睡眠滿意度（1-5 分，UI: 按鈕）、睡眠總時數。
*   **消化狀況：** 今日是否排便（UI: 單選）、排便時間（UI: Time Picker）。
*   **健康指標：** 早上過敏症狀（UI: 多選 chip - 無/鼻塞/打噴嚏/眼睛癢）。
*   **心理狀態：** 起床心情（UI: 表情符號單選 😊/😐/😔/😡）。
*   **肝臟養生：** 護肝行為（UI: 多選 chip - 昨晚 11 點前睡/無飲酒/早上喝溫水/吃保健食品）。
*   **分享開關：** 「本次分享到群組」勾選項，預設開啟，使用者可關閉（隱私控制，見 §4）。

### 2. 時區與跨日定義
*   **Vercel 的執行環境是 UTC**，所有「今天是哪一天」的判斷都必須明確轉換為 `Asia/Taipei`，不可依賴 `new Date()` 的本地時區。
*   一筆紀錄的日期以**送出當下的台北時間日期**為準，欄位 `record_date`（`date` 型別）。
*   「昨晚 11 點前睡」定義為 `record_date` 前一日的 23:00 之前入睡。文案直接寫「昨晚 11 點前入睡」避免歧義。
*   Cron 設定為 `0 0 * * *`（00:00 UTC）以對應台北時間 08:00。

### 3. 觸發機制 (Trigger)
*   **定時提醒（主要路徑）：** Vercel Cron 每天觸發 `/api/cron/daily-reminder`，呼叫 Messaging API push message，將含 LIFF 連結的提醒推送至已登記群組。
    *   **前提：** push 需要 `groupId`，只能從 Webhook 事件取得（見 Step 4.3）。
    *   **額度：** LINE 免費方案每月推播則數有上限，每日一群組一則（約 30 則/月）在額度內。
    *   **Vercel Hobby 方案的 Cron 一天只能觸發一次**，週報功能因此改為在每日 Cron 內判斷「今天是否為星期一」再決定要不要發，而非另設週排程。
*   **手動觸發（降級路徑）：** 官方帳號圖文選單 (Rich Menu) 常駐按鈕，供使用者隨時開啟 LIFF 記錄或更新當天數據。
    *   **限制：** 從 Rich Menu 開啟時 LIFF context 是「與官方帳號的一對一聊天」，`liff.sendMessages()` 只會發到該對話，**無法**發到群組。此路徑僅供記錄／補填，前端偵測後隱藏分享開關。

### 4. 群組社交與分享機制

**設計決策：以「群組內開啟 LIFF」作為唯一的群組分享路徑。**

`liff.sendMessages()` 只能將訊息送到「開啟這個 LIFF 的那個聊天室」，且需同時滿足：
1.  LIFF 應用已勾選 `chat_message.write` scope；
2.  在 LINE 內建瀏覽器開啟（外部瀏覽器不支援）；
3.  `liff.getContext().type` 為 `group` / `room` / `utou`。

因此「從 Rich Menu 記錄後自動分享到群組」技術上不可行。替代方案是由 bot 用 push message 代發，但會顯示為官方帳號名義而非使用者本人，失去社交監督的臨場感。**本專案採用：早上推播的群組提醒訊息即是分享入口**，使用者從群組點進 LIFF、填完即以本人名義發卡片回該群組。Rich Menu 路徑定位為「補填／修改」，不分享。

*   身分驗證：前端 `liff.getIDToken()`，後端呼叫 LINE `verify` 端點取得可信 userId。**前端不傳送 userId**。
*   前端啟動時以 `liff.getContext()` 判斷路徑：
    *   `group` / `room`：顯示分享開關（預設勾選），送出成功後呼叫 `liff.sendMessages()`。
    *   `utou` / `none` / 外部瀏覽器：隱藏分享開關，僅寫入資料。
*   **隱私保護：** Flex Message 僅顯示社交友好的指標（總體評分、護肝達標率、心情 emoji），不含排便時間、過敏細節。分享開關讓使用者逐次選擇。首次使用顯示一次性告知並記錄 `consent_shared_at`。
*   Flex Message 必須帶 `altText`，JSON 大小上限 50KB。

### 5. 資料庫 Schema (Supabase / Postgres)

```sql
-- 每日紀錄：一人一天一列
create table records (
  id            uuid primary key default gen_random_uuid(),
  record_date   date not null,
  user_id       text not null,              -- LINE userId（後端驗證後取得）
  display_name  text,
  sleep_score   smallint check (sleep_score between 1 and 5),
  sleep_hours   numeric(3,1),
  bowel_movement boolean,
  bowel_time    time,                        -- 隱私欄位，不分享
  allergy       text[] default '{}',         -- 隱私欄位，不分享
  mood          text,
  liver_care    text[] default '{}',
  liver_score   smallint,                    -- 護肝達標數，後端計算
  shared        boolean default false,
  source_chat_id text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (record_date, user_id)              -- 關鍵：upsert 依據，天然解決併發
);
create index on records (user_id, record_date desc);

-- 推播目標
create table chats (
  chat_id    text primary key,
  chat_type  text not null,                  -- group | room
  joined_at  timestamptz default now(),
  active     boolean default true
);

-- 使用者
create table users (
  user_id          text primary key,
  display_name     text,
  first_seen_at    timestamptz default now(),
  consent_shared_at timestamptz
);
```

*   **併發：** `insert ... on conflict (record_date, user_id) do update` 由資料庫保證原子性，不需要應用層鎖。
*   **RLS：** 三張表都啟用 Row Level Security 且**不建立任何 public policy**。所有存取都由 server route 以 service role key 進行，前端永遠不直接連 Supabase。

---

## 給開發 AI 的實作步驟指示 (Action Plan)

> **部署順序注意：** LIFF 建立時必須填入有效的 HTTPS Endpoint URL，而前端又需要 LIFF ID 才能初始化。因此先把 Nuxt 專案部署上 Vercel 拿到固定網址，再建立 LIFF、取得 ID 後以環境變數注入。

### Step 0: 專案初始化與取得網址（先做）
1.  在 repo **根目錄**建立 Nuxt 專案（`nuxi init` 的產出直接放根層，不要再包一層子資料夾）。
    *   理由：Vercel 匯入時不必額外指定 Root Directory；設計文件也能與程式一起進版控，統一放在 `docs/`。
2.  安裝相依套件：
    ```bash
    pnpm add -D @nuxtjs/tailwindcss
    pnpm add @line/liff @supabase/supabase-js
    ```
3.  連接 Vercel 並部署一版 placeholder，取得固定網址（例如 `https://emily-liff.vercel.app`）。
4.  之後每次 push 到 main 即自動部署，PR 會有 preview URL 可測。

### Step 1: LINE 平台環境建置
1.  建立 LINE Developers Provider。
2.  建立 **Messaging API Channel**：取得 `Channel Access Token` 與 `Channel Secret`；開啟 `Allow bot to join group chats`，關閉自動回覆訊息。
3.  建立 **LINE Login Channel**：LIFF 應用是掛在 Login Channel 底下，不是 Messaging API Channel。取得其 `Channel ID`（即驗證 ID Token 時的 `client_id`）。
4.  在 Login Channel 中設定 **Linked LINE Official Account**，連結到步驟 2 的 Messaging API Channel。**未連結則 `chat_message.write` 無法運作。**
5.  在 Login Channel 建立 LIFF 應用程式：
    *   Size 設為 **Tall**（短表單體驗較佳，Full 會有多餘留白）。
    *   Endpoint URL 填入 Step 0 的 Vercel 網址。
    *   Scopes 勾選 `profile`、`openid`、**`chat_message.write`**（缺這項無法發送 Flex Message）。
6.  取得 `LIFF ID`。

### Step 2: Supabase 建置
1.  建立 Supabase 專案，於 SQL Editor 執行 §5 的建表語句。
2.  三張表啟用 RLS，不建立任何 policy。
3.  取得 `Project URL` 與 **`service_role` key**（此 key 具完整權限，**只能放在 server 端環境變數，絕不可進 `runtimeConfig.public`**）。

### Step 3: 環境變數
於 Vercel 專案設定（以及本機 `.env`）建立：

| 變數 | 用途 | 曝光範圍 |
|---|---|---|
| `NUXT_PUBLIC_LIFF_ID` | 前端 `liff.init()` | 公開 |
| `LINE_LOGIN_CHANNEL_ID` | 驗證 ID Token 的 `client_id` | 僅 server |
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API 推播 | 僅 server |
| `LINE_CHANNEL_SECRET` | Webhook 簽章驗證 | 僅 server |
| `SUPABASE_URL` | 資料庫連線 | 僅 server |
| `SUPABASE_SERVICE_ROLE_KEY` | 資料庫連線 | 僅 server |
| `CRON_SECRET` | 保護 Cron 端點 | 僅 server |

`nuxt.config.ts` 對應：
```ts
export default defineNuxtConfig({
  ssr: false,                                  // SPA：頁面不做 SSR，但 server/api 仍正常運作
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    lineLoginChannelId: '',
    lineChannelAccessToken: '',
    lineChannelSecret: '',
    supabaseUrl: '',
    supabaseServiceRoleKey: '',
    cronSecret: '',
    public: { liffId: '' }                     // 只有這層會進 client bundle
  }
})
```

### Step 4: 後端開發 (Nitro Server Routes)

#### 4.1 共用工具
*   `server/utils/supabase.ts`：以 service role key 建立 Supabase client（單例）。
*   `server/utils/verifyIdToken.ts`：POST 至 `https://api.line.me/oauth2/v2.1/verify`，帶 `id_token` 與 `client_id`，回傳 `{ userId: payload.sub, displayName: payload.name }`。**驗證失敗一律 `throw createError({ statusCode: 401 })`，不得寫入任何資料。**
*   `server/utils/taipeiDate.ts`：取得台北時區的 `YYYY-MM-DD`。
*   `server/utils/line.ts`：Messaging API push 封裝。

#### 4.2 `POST /api/records`（送出紀錄）
1.  讀 body 取出 `idToken` 與表單欄位。
2.  驗證 ID Token 取得可信 `userId`、`displayName`。
3.  後端自行以台北時區計算 `record_date`（不信任前端傳來的日期）。
4.  計算 `liver_score`。
5.  `upsert` 至 `records`，`onConflict: 'record_date,user_id'`。
6.  同步 upsert `users` 表的 `display_name`。
7.  回傳寫入結果。

#### 4.3 `POST /api/line/webhook`（取得推播目標）
1.  用 `readRawBody(event)` 取原始字串做 HMAC-SHA256 簽章驗證（比對 `x-line-signature`），**驗證前不可先 parse JSON**，否則簽章對不上。
2.  處理 `join` 事件與群組內 `message` 事件：upsert `chats`（`source.groupId` / `source.roomId`）。
3.  處理 `leave` 事件：將 `active` 設為 `false`。
4.  一律快速回 200，避免 LINE 端 timeout 重送。
5.  將此路由的完整 URL 填入 Messaging API Channel 的 Webhook URL 並啟用。

#### 4.4 `GET /api/records/me`（歷史查詢）
1.  以 header 帶 `idToken` 驗證身分。
2.  回傳該使用者近 7 / 30 日紀錄，供趨勢頁使用。

#### 4.5 `GET /api/cron/daily-reminder`（定時推播）
1.  驗證 `Authorization: Bearer ${CRON_SECRET}`，防止端點被外部任意呼叫。
2.  讀取 `chats` 中 `active = true` 的聊天室，push 含 `https://liff.line.me/<LIFF_ID>` 的提醒訊息。
3.  若今日為星期一（台北時區），額外推送上週彙整的週報 Flex Message。
4.  `vercel.json` 設定：
    ```json
    { "crons": [{ "path": "/api/cron/daily-reminder", "schedule": "0 0 * * *" }] }
    ```

### Step 5: 前端開發 (Nuxt SPA)

#### 5.1 專案結構
```
app.vue                          # 只放 <NuxtPage />
pages/index.vue                  # 每日記錄表單（主畫面）
pages/history.vue                # 我的紀錄（趨勢）
composables/useLiff.ts           # LIFF 初始化、登入、context、sendMessages 封裝
composables/useRecordApi.ts      # 呼叫 /api/records 的封裝
components/ScoreSelector.vue     # 1-5 分按鈕
components/ChipMultiSelect.vue   # 過敏 / 護肝多選
components/MoodPicker.vue        # 心情 emoji 單選
utils/flexMessage.ts             # 組 Flex Message JSON
types/record.ts                  # 表單與 API 型別，前後端共用
```

#### 5.2 LIFF 初始化（`composables/useLiff.ts`）
1.  `import liff from '@line/liff'` 使用 npm 套件（型別與載入時機可控，勝過塞 CDN script）。
2.  初始化一律在 `onMounted` 內執行；以 `useState` 保存 `ready` / `profile` / `context` 供全站共用。
3.  `liff.init({ liffId })` 後檢查 `liff.isLoggedIn()`，未登入則 `liff.login()`。
4.  `liff.getContext()` 判斷是否在群組情境，據以顯示／隱藏分享開關（見 §4）。
5.  初始化未完成前顯示 skeleton／loading，不要讓表單先閃出來。

#### 5.3 表單與樣式
1.  單頁式表單，高度優化手機端（按鈕加大、最少打字、一畫面可完成）。
2.  **樣式一律使用 Tailwind CSS**，不手寫獨立 CSS 檔、不引入元件庫；共用樣式抽成 Vue 元件而非 `@apply`。
3.  行動優先：以無前綴的基準樣式對應手機，必要時才加 `sm:` / `md:` 斷點。觸控目標至少 `h-12`（48px）。
4.  選取狀態用 `peer` / `peer-checked:` 搭配隱藏的 `input` 實作，避免用 JS 操作 class；元件以 `defineModel()` 對外提供 `v-model`。
5.  **載入當日既有紀錄**：`onMounted` 時查詢當天資料，已填過則回填表單，讓使用者是「修改」而非重填。

#### 5.4 送出邏輯
1.  以 `pending` ref 立即禁用送出鈕並顯示 loading，防止重複點擊。
2.  `await $fetch('/api/records', { method: 'POST', body: payload })` —— **同源請求，沒有 CORS 問題**，可正常使用 JSON。
3.  不要用 `useFetch`／`useAsyncData`，這是使用者觸發的動作而非頁面資料載入。
4.  payload 包含 `idToken` 與表單欄位，**不含** userId 與日期（皆由後端決定）。
5.  成功後若在群組情境且分享開關開啟，呼叫 `liff.sendMessages([flexMessage])`（需含 `altText`）。
6.  執行 `liff.closeWindow()`。
7.  **錯誤處理：** 失敗時恢復送出鈕、顯示可讀錯誤訊息並允許重試，不可靜默失敗或直接關閉視窗。

### Step 6: 資料回顧（避免只進不出）
1.  `pages/history.vue` 呼叫 `/api/records/me`，顯示近 7 日睡眠分數與護肝達標率趨勢。
2.  趨勢圖以 Tailwind + 純 CSS/SVG 長條呈現即可，資料點少，不需引入圖表庫。
3.  由主畫面以 `<NuxtLink>` 導向。
4.  週報：每週一由 Cron 推播群組 Flex Message，彙整各成員上週護肝達標率排行。

### Step 7: 測試與優化
1.  本機 `pnpm dev` 需搭配 ngrok 之類的 HTTPS 通道才能綁 LIFF Endpoint 測試；或直接使用 Vercel preview URL 測試。
2.  在 LINE 內建瀏覽器測試 `liff.init()` 與登入流程；另測外部瀏覽器開啟時應正常降級（可記錄、不顯示分享）。
3.  測試獨立填寫是否正確寫入；同日再次送出應為**更新**同一列而非新增（驗證 unique 約束與 upsert）。
4.  將 bot 邀請進測試群組，確認 `join` 事件寫入 `chats`；以帶 `CRON_SECRET` 的 curl 手動觸發 `/api/cron/daily-reminder` 驗證推播。
5.  在群組中點擊推播連結開啟 LIFF，填寫後確認能以使用者名義發佈 Flex Message，且卡片不含排便時間與過敏細節。
6.  驗證安全性：
    *   以 curl 送出偽造或過期的 `idToken`，應回 401 且無資料寫入。
    *   不帶 `CRON_SECRET` 呼叫 Cron 端點，應被拒絕。
    *   Webhook 帶錯誤簽章，應被拒絕。
    *   檢查 client bundle 中不得出現 `service_role` key 或任何 LINE secret。
7.  多人同時送出的併發測試，確認 upsert 無資料覆蓋或重複列。

---

## 已知限制與風險

| 項目 | 說明 |
|---|---|
| Rich Menu 無法分享至群組 | LIFF 平台限制，已於 §4 說明並採降級設計。 |
| 推播額度 | LINE 免費方案每月推播則數有上限，群組數增加需監控。 |
| Vercel Cron 頻率 | Hobby 方案一天僅能觸發一次，週報改由每日 Cron 內判斷星期執行。 |
| Vercel 執行環境為 UTC | 所有日期判斷須顯式轉 `Asia/Taipei`，是最容易出錯的地方。 |
| Nuxt 需 `ssr: false` | LIFF SDK 依賴瀏覽器環境；也代表首屏需等 JS 載入，要備妥 loading 狀態。 |
| service role key 外洩風險 | 該 key 具完整資料庫權限，務必只放 server 端 runtimeConfig，並在部署後檢查 client bundle。 |
| LIFF 掛在 Login Channel | 需額外建立 LINE Login Channel 並與官方帳號連結，否則 `chat_message.write` 無效。 |
| 群組隱私 | 分享的摘要欄位所有群組成員可見，已提供逐次分享開關與首次告知。 |
