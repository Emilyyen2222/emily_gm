-- 019：訓練紀錄（重量訓練）
--
-- 一天可以有好幾個動作，所以不能放進 records（一人一天一列）。
-- 一列是「某天的某個動作」，各組的重量與次數存在 sets（[{weight, reps}]）。
-- weight 為 null 代表自體重。
--
-- shared 預設 false：跟花費一樣，預設不分享，由使用者自己勾。
create table if not exists workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  workout_date date not null,
  exercise     text not null,
  -- 每個動作各自選單位：同一間健身房裡，啞鈴可能是 lb、槓鈴是 kg
  unit         text not null default 'kg' check (unit in ('kg', 'lb')),
  sets         jsonb not null,
  shared       boolean not null default false,
  -- 頁面上的排列順序。同一次儲存的列 created_at 會一模一樣，沒有這欄就還原不了順序
  sort_order   smallint not null default 0,
  created_at   timestamptz default now()
);

create index if not exists workouts_user_date_idx on workouts (user_id, workout_date desc);

-- 與其他表一致：不建任何 policy，只有帶 service_role key 的 server routes 進得來
alter table workouts enable row level security;

-- 自己新增過的動作，下次直接出現在清單裡（跟自訂自我照顧項目一樣存在 users）
alter table users add column if not exists custom_exercises text[];
