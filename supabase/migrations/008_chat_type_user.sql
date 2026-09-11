-- 008：讓 chats 也能存「一對一」的推播對象
-- 群組被退掉之後，官方帳號的一對一聊天室是唯一還能主動提醒的管道。
alter table chats drop constraint if exists chats_chat_type_check;
alter table chats add constraint chats_chat_type_check
  check (chat_type in ('group', 'room', 'user'));
