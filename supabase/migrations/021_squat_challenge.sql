-- 021：深蹲挑戰
--
-- 打「深蹲 60」就記一次，每天加總跟自己的目標比；在群組加入挑戰的人，
-- 前一天的次數會出現在那個群組早上的提醒裡，讓朋友看得到彼此有沒有蹲。
--
-- 聊天打卡不寫進 workouts：訓練頁存檔是「刪掉整天再整批寫入」，
-- 頁面開著沒重新整理時存檔，中間從聊天打的卡就會被刪掉，而且不會有人發現。
-- 打卡是一筆一筆加上去的，獨立一張表才不會被整批取代。
-- 每天的進度 = 這張表的加總 + 訓練頁「深蹲」的次數 × 組數。
create table if not exists squat_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  -- 台北日期，由後端決定
  squat_date date not null,
  reps       integer not null check (reps > 0 and reps <= 1000),
  created_at timestamptz default now()
);
create index if not exists squat_checkins_user_date_idx on squat_checkins (user_id, squat_date desc);

-- 誰在「哪個群組」加入了挑戰。
--
-- 一定要綁群組，不能只記「某人加入了」：只記人的話，在 A 群組按加入，
-- 次數就會出現在他所在的 B 群組，那是他沒同意過的地方。
-- 離開群組、bot 被踢出群組時刪除；推播前還會再向 LINE 確認一次人還在群組裡。
create table if not exists squat_members (
  chat_id   text not null,
  user_id   text not null,
  joined_at timestamptz default now(),
  primary key (chat_id, user_id)
);
create index if not exists squat_members_user_idx on squat_members (user_id);

-- 與其他表一致：不建任何 policy，只有帶 service_role key 的 server routes 進得來
alter table squat_checkins enable row level security;
alter table squat_members  enable row level security;

-- 每天目標幾下。每個人一個，不分群組：深蹲是本人做的，跟在哪個群組打卡無關。
-- null = 沒設過，用預設的 100
alter table users add column if not exists squat_goal smallint check (squat_goal > 0 and squat_goal <= 1000);
