-- 010：自我照顧項目改為每人自選
--
-- users.habits 存這個人選的 2–5 項。
-- records.liver_total 存「當下那筆紀錄的分母」——不能在讀取時才用使用者
-- 目前的設定去算，否則有人日後把項目從 3 項改成 5 項，過去每一天的達成率
-- 都會跟著變動，歷史資料就失真了。
alter table users   add column if not exists habits      text[];
alter table records add column if not exists liver_total smallint;

-- 既有紀錄的分母補成 3（先前固定三項）
update records set liver_total = 3 where liver_total is null;
