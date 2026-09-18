-- 015：體溫。
--
-- 分成兩欄而不是一欄：早晨剛醒、還沒下床的基礎體溫反映的是身體的基礎狀態
-- 與發炎程度；睡前體溫則受晚餐、活動量、洗澡與室溫影響，只適合拿來看
-- 體溫下降與當晚入睡的關聯。兩者混在同一欄，兩邊的意義都會消失。
--
-- 這兩欄永遠不會進今日狀態卡片：體溫是醫療訊號，寫在群組卡片上容易引來
-- 「你是不是發燒了」的追問。要開放分享是日後的決定，不是預設。
alter table records add column if not exists morning_temp numeric(3,1)
  check (morning_temp between 34 and 42);
alter table records add column if not exists night_temp numeric(3,1)
  check (night_temp between 34 and 42);
