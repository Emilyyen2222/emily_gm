-- 005：入睡／起床時間（睡眠時數改為自動計算）
alter table records add column if not exists bed_time  time;
alter table records add column if not exists wake_time time;

-- 這裡原本還加了一個 period 欄位做經期追蹤，但那版的選項設計得不好
-- （只寫「輕／中／重」卻沒說是什麼的輕重），已在下一次改動中整個移除。
-- 資料表裡的 period 欄位刻意保留不刪：它是空的、不佔成本，而 drop column
-- 是不可逆的操作，沒有必要為了乾淨去承擔那個風險。
alter table records add column if not exists period    text;
