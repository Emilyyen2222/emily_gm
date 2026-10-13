-- 023：從 iPhone 健康 App 同步月經紀錄
--
-- 想看月經週期跟體溫、睡眠的關係，最關鍵的資料只有「哪幾天在經期」。
-- 大家本來就用健康 App 記，在這裡再記一次一定會漏，所以用 iPhone 的「捷徑」
-- 讀健康 App 的月經紀錄送過來（網頁與 LINE 都讀不到健康 App，只有捷徑可以）。
--
-- 005 留下的 records.period 欄位不用：那是每天表單的一格，這裡的資料來源是健康 App，
-- 而且某一天在經期不代表那天有填表單。

-- 一列 = 某人在經期的某一天。捷徑每次送最近 90 天，後端用它整批取代那 90 天，
-- 在健康 App 刪掉或補記的日子，下次同步就跟上
create table if not exists period_days (
  user_id    text not null,
  day        date not null,
  synced_at  timestamptz default now(),
  primary key (user_id, day)
);

-- 捷徑用的同步碼。捷徑拿不到 LINE 的 ID Token，只能帶一組固定的密碼。
-- 只存雜湊：資料庫外流也還原不出同步碼。一人一組，重新產生就覆蓋（舊的失效）
create table if not exists health_sync_tokens (
  user_id      text primary key,
  token_hash   text not null unique,
  created_at   timestamptz default now(),
  last_used_at timestamptz
);

-- 與其他表一致：不建任何 policy，只有帶 service_role key 的 server routes 進得來
alter table period_days        enable row level security;
alter table health_sync_tokens enable row level security;
