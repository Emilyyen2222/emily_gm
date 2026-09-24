-- Emily LIFF 健康追蹤 — Supabase / Postgres schema
-- 在 Supabase 專案的 SQL Editor 整段執行。

-- 每日紀錄：一人一天一列
create table if not exists records (
  id             uuid primary key default gen_random_uuid(),
  record_date    date not null,
  user_id        text not null,
  display_name   text,
  sleep_score    smallint check (sleep_score between 0 and 100),  -- 睡眠滿意度百分比
  sleep_hours    numeric(3,1),               -- 由 bed_time 與 wake_time 自動算出
  bed_time       time,
  wake_time      time,
  sleep_note     text,
  -- 早晨剛醒、還沒下床的基礎體溫。看的是基礎狀態與發炎程度
  morning_temp   numeric(3,1) check (morning_temp between 34 and 42),
  -- 睡前體溫。受晚餐、活動量、洗澡與室溫影響，只適合看與入睡的關聯
  night_temp     numeric(3,1) check (night_temp between 34 and 42),
  bowel_movement boolean,
  bowel_time     time,          -- 已由 bowel_times 取代，仍同步寫第一次的時間
  bowel_times    text[],        -- 每次排便的時間 HH:MM，記了幾個就是幾次
  bowel_note     text,
  leave_home_time time,                      -- 早上出門時間
  leave_office_time time,                    -- 離開公司時間
  allergy        text[] default '{}',
  allergy_note   text,
  mood           text,
  mood_note      text,
  private_note   text,                       -- 只給自己的，永遠不進 Flex Message
  steps          integer check (steps >= 0 and steps <= 200000),
  liver_care     text[] default '{}',
  liver_score    smallint default 0,
  -- 那筆紀錄當下的分母（使用者當時選了幾項）。存下來，日後改設定不會讓歷史失真
  liver_total    smallint,
  shared         boolean default false,
  source_chat_id text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  -- 這條約束是重複送出走 upsert 的依據，也讓併發由資料庫保證，
  -- 應用層因此不需要任何鎖
  constraint records_date_user_unique unique (record_date, user_id)
);

create index if not exists records_user_date_idx on records (user_id, record_date desc);

-- 記帳：一天多筆，所以獨立成一張表。
-- shared 預設 false —— 金額送進聊天室就收不回來，一律由使用者逐筆勾選。
create table if not exists expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  spent_date date not null,
  item       text not null,
  amount     integer not null check (amount >= 0 and amount <= 1000000),
  shared     boolean not null default false,
  -- 表單上的排列順序。同一次送出的列 created_at 會一模一樣，
  -- 沒有這一欄就無法還原使用者輸入的順序
  sort_order smallint not null default 0,
  created_at timestamptz default now()
);

create index if not exists expenses_user_date_idx on expenses (user_id, spent_date desc);

-- 推播目標：groupId 只能從 LINE webhook 事件取得
create table if not exists chats (
  chat_id   text primary key,
  chat_type text not null check (chat_type in ('group', 'room', 'user')),
  joined_at timestamptz default now(),
  active    boolean default true
);

create table if not exists users (
  user_id           text primary key,
  display_name      text,
  -- 這個人自選的自我照顧項目（2–5 項）
  habits            text[],
  -- 記帳卡片上的稱呼（例如男友的暱稱）。沒填就顯示中性的「花費」
  expense_label     text,
  first_seen_at     timestamptz default now(),
  consent_shared_at timestamptz,
  -- AI 問答：null = 還沒問過，要先給同意卡片
  ai_consent          text check (ai_consent in ('granted', 'declined')),
  ai_consent_at       timestamptz,
  ai_pending_question text,
  -- 自己新增過的訓練動作
  custom_exercises    text[]
);

-- AI 問答每人每天的使用次數
create table if not exists ai_usage (
  user_id    text not null,
  usage_date date not null,
  count      smallint not null default 0,
  primary key (user_id, usage_date)
);

-- 還沒到上限就 +1（原子操作），見 migrations/016_ai.sql
create or replace function ai_usage_take(p_user_id text, p_date date, p_limit smallint)
returns boolean
language plpgsql
as $$
declare
  taken smallint;
begin
  insert into ai_usage (user_id, usage_date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, usage_date)
    do update set count = ai_usage.count + 1
    where ai_usage.count < p_limit
  returning count into taken;
  return taken is not null;
end;
$$;
revoke execute on function ai_usage_take(text, date, smallint) from public, anon, authenticated;

-- 訓練紀錄：一列是某天的某個動作，sets = [{weight, reps}]，weight 為 null 代表自體重
create table if not exists workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  workout_date date not null,
  exercise     text not null,
  unit         text not null default 'kg' check (unit in ('kg', 'lb')),
  sets         jsonb not null,
  shared       boolean not null default false,
  sort_order   smallint not null default 0,
  created_at   timestamptz default now()
);
create index if not exists workouts_user_date_idx on workouts (user_id, workout_date desc);

-- 每天 08:00 產生的新聞（公開內容，不含任何人的資料）
create table if not exists news_digests (
  kind        text not null check (kind in ('health', 'ai', 'quote')),
  digest_date date not null,
  content     jsonb not null,
  created_at  timestamptz default now(),
  primary key (kind, digest_date)
);

-- 全部啟用 RLS 且不建立任何 policy：
-- 只有帶 service_role key 的 server routes 進得來，瀏覽器完全無法直連。
alter table records enable row level security;
alter table chats   enable row level security;
alter table users   enable row level security;
alter table expenses enable row level security;
alter table ai_usage enable row level security;
alter table news_digests enable row level security;
alter table workouts enable row level security;
