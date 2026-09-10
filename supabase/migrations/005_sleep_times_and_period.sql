-- 005：入睡／起床時間（睡眠時數改為自動計算）與經期追蹤
alter table records add column if not exists bed_time  time;
alter table records add column if not exists wake_time time;
-- 經期：無／輕／中／重。屬隱私欄位，絕不進 Flex Message
alter table records add column if not exists period    text;
