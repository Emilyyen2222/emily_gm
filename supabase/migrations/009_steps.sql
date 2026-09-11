-- 009：今天走了幾步
-- 選步數而不是「運動時長」，是因為步數沒有判斷空間 —— 不用每天重新想
-- 「這樣算不算運動」。代價是要離開 LINE 去翻健康 App。
alter table records add column if not exists steps integer check (steps >= 0 and steps <= 200000);
