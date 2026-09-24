-- 018：排便改成可以記多次
--
-- 一天不只一次的人沒辦法記錄。改成「每次記一個時間，記了幾個就是幾次」，
-- 存成 'HH:MM' 字串陣列，順序就是使用者輸入的順序。
-- 按了「有」但沒填時間的，bowel_movement = true、bowel_times 為空陣列。
alter table records add column if not exists bowel_times text[];

-- 舊資料的單次時間搬過來，歷史紀錄不會不見
update records
set bowel_times = array[to_char(bowel_time, 'HH24:MI')]
where bowel_time is not null and bowel_times is null;

-- bowel_time 保留不刪：寫入時仍同步寫第一次的時間，萬一要退回舊版程式也讀得到
