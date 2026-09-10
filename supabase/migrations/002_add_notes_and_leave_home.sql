-- 002：新增文字備註欄位與出門時間
-- 在 Supabase 的 SQL Editor 整段執行（可重複執行，不會出錯）。

alter table records add column if not exists sleep_note      text;
alter table records add column if not exists mood_note       text;
alter table records add column if not exists bowel_note      text;
alter table records add column if not exists leave_home_time time;
