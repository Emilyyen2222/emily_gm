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
  sleep_note     text,                       -- 隱私欄位，不進 Flex Message
  bowel_movement boolean,
  bowel_time     time,                       -- 隱私欄位，不進 Flex Message
  bowel_note     text,                       -- 隱私欄位，不進 Flex Message
  leave_home_time time,                      -- 早上出門時間
  leave_office_time time,                    -- 離開公司時間
  allergy        text[] default '{}',        -- 隱私欄位，不進 Flex Message
  allergy_note   text,                       -- 隱私欄位，不進 Flex Message
  mood           text,
  mood_note      text,                       -- 隱私欄位，不進 Flex Message
  period         text,                       -- 隱私欄位，絕不進 Flex Message
  liver_care     text[] default '{}',
  liver_score    smallint default 0,
  shared         boolean default false,
  source_chat_id text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  -- 這條約束是重複送出走 upsert 的依據，也讓併發由資料庫保證，
  -- 應用層因此不需要任何鎖
  constraint records_date_user_unique unique (record_date, user_id)
);

create index if not exists records_user_date_idx on records (user_id, record_date desc);

-- 推播目標：groupId 只能從 LINE webhook 事件取得
create table if not exists chats (
  chat_id   text primary key,
  chat_type text not null check (chat_type in ('group', 'room')),
  joined_at timestamptz default now(),
  active    boolean default true
);

create table if not exists users (
  user_id           text primary key,
  display_name      text,
  first_seen_at     timestamptz default now(),
  consent_shared_at timestamptz
);

-- 全部啟用 RLS 且不建立任何 policy：
-- 只有帶 service_role key 的 server routes 進得來，瀏覽器完全無法直連。
alter table records enable row level security;
alter table chats   enable row level security;
alter table users   enable row level security;
