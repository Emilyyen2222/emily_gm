-- 012：過敏選項改名
-- 舊值一併換掉，否則「每日」分頁裡舊的日子顯示舊名稱、新的顯示新名稱。
update records set allergy = array_replace(allergy, '無',     '今天沒有') where '無'     = any(allergy);
update records set allergy = array_replace(allergy, '鼻塞',   '鼻子過敏') where '鼻塞'   = any(allergy);
update records set allergy = array_replace(allergy, '眼睛癢', '眼睛過敏') where '眼睛癢' = any(allergy);
update records set allergy = array_replace(allergy, '皮膚癢', '皮膚過敏') where '皮膚癢' = any(allergy);
