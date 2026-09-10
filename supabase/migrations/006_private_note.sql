-- 006：只給自己的備註。這一欄永遠不會進 Flex Message，是使用者的私人空間。
alter table records add column if not exists private_note text;
