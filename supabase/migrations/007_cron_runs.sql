-- 007：Cron 執行紀錄
-- Vercel 免費方案的 log 保留時間很短（約一小時），隔天就查不到昨天的執行狀況。
-- 自己記一份在資料庫裡，才能回答「昨天早上到底有沒有跑」這種問題。
create table if not exists cron_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  started_at  timestamptz default now(),
  finished_at timestamptz,
  -- 'started' 會在進入端點時就寫入。如果一直停在這個狀態，
  -- 代表有被觸發但中途掛掉 —— 這跟「完全沒被觸發」是兩回事。
  status      text not null default 'started',
  triggered_by text,                -- vercel-cron 或手動
  sent        smallint default 0,
  failed      smallint default 0,
  weekly      boolean default false,
  note        text
);
create index if not exists cron_runs_started_idx on cron_runs (started_at desc);
alter table cron_runs enable row level security;
