---
name: db-migration
description: 這個專案要改資料庫結構時的固定流程（新增資料表、欄位、function、約束，或搬移資料）。只要功能需要動到 Supabase 的 schema，就在寫程式之前先照這個流程走，確保 migration 在程式上線前就已經在正式資料庫執行完。
---

# 加資料表的流程

**為什麼要照順序：** 程式先上線、資料庫欄位還沒建好的話，寫入會直接失敗——大家送不出紀錄。
Supabase 的 migration 由 妍 手動在 SQL Editor 執行，所以一定是「妍 跑完 → 驗證 → 才 push」。

## 1. 寫 migration

- 看 `supabase/migrations/` 最新的編號，新檔用下一號：`NNN_簡短名稱.sql`。
- 檔頭用註解說明**為什麼**需要這個變更，不只是做了什麼。
- 一律可以重複執行：`create table if not exists`、`add column if not exists`、`create or replace function`。
- 新資料表：`enable row level security`，**不建任何 policy**——只有帶 service_role key 的 server routes 進得來，瀏覽器無法直連。
- 新 function：`revoke execute on function ... from public, anon, authenticated;`
- 改舊欄位時**不要刪舊欄位**：新增新欄位、用 `update` 把舊資料搬過去，程式同步寫入舊欄位，萬一要退回舊版程式也讀得到。
- 需要的時候，讀取端要能同時處理新舊格式（例如 `rowToRecord`、`normalizeRows` 的做法）。

## 2. 同步 schema.sql

把同樣的結構寫進 `supabase/schema.sql` 對應的位置（資料表定義、RLS 那一段）。全新安裝時只跑 schema.sql 就要能一次建好。

## 3. 寫程式、檢查、commit 在本機

- 用到新欄位的程式寫好，跑 `pnpm exec nuxi typecheck`（已知的舊錯誤見 predeploy-check）。
- commit 在本機，**不要 push**。

## 4. 請 妍 執行

給檔案連結和步驟：

> 到 Supabase 的 SQL Editor 執行 [supabase/migrations/NNN_xxx.sql](supabase/migrations/NNN_xxx.sql)：
> SQL Editor → New query → 貼上全部內容 → Run，看到 `Success. No rows returned` 就完成了。

並說明這次會新增什麼、會不會動到現有資料。

## 5. 驗證（妍 說跑完之後）

用 `.env` 裡的 `NUXT_SUPABASE_URL`、`NUXT_SUPABASE_SERVICE_ROLE_KEY` 寫一支臨時腳本（放在專案根目錄才抓得到 node_modules，跑完立刻刪掉），**只檢查結構與筆數**：

- 欄位是否存在：`select('新欄位').limit(0)`，看有沒有錯誤。
- 資料表是否存在：`select('*', { count: 'exact', head: true })`。
- function：用假的 user_id（例如 `__schema_test__`）呼叫，確認行為，**測完刪掉測試資料**。
- 有搬資料的話，比對新舊欄位的筆數。

**絕對不要印出任何人的資料列**（見 privacy-check）。讀 `.env` 時也不要把值印出來。

## 6. push

驗證通過才 push，接著照 predeploy-check 確認正式站部署完成。
