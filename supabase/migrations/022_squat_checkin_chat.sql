-- 022：深蹲看板改成「在群組打卡的人」
--
-- 原本要先在群組打「加入深蹲」才會上看板。打卡和加入分成兩個指令，朋友看不懂，
-- 改成一條規則：在群組打卡，隔天早上就會出現在那個群組的看板；在一對一打卡只有自己看得到。
-- 打卡當下 bot 就已經在那個群組回覆了當天的次數，看板只是隔天再整理一次。
--
-- 所以每次打卡要記下是在哪個聊天室打的。一對一打卡是 null。
alter table squat_checkins add column if not exists chat_id text;
create index if not exists squat_checkins_chat_date_idx on squat_checkins (chat_id, squat_date);

-- squat_members（021）不再使用。刻意保留不刪：drop table 不可逆，留著不佔成本
