-- 014：記帳卡片上的稱呼。
--
-- 卡片標題要能寫出「誰付的」，但這個 app 不只一個人在用，稱呼不能寫死在
-- 程式裡。沒填的人就顯示中性的「花費」，不會看到別人的稱呼。
alter table users add column if not exists expense_label text;
