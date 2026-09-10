-- 004：睡眠滿意度從 1-5 分改為 0-100 百分比
-- 順序不能換：先拿掉舊約束，把既有資料換算成百分比，最後才加上新約束。

alter table records drop constraint if exists records_sleep_score_check;

-- 既有的 1-5 分換算成 20/40/60/80/100，避免舊紀錄在新的百分比刻度下失真
update records set sleep_score = sleep_score * 20 where sleep_score is not null and sleep_score <= 5;

alter table records add constraint records_sleep_score_check check (sleep_score between 0 and 100);
