-- 013：記帳。一天多筆，所以不能放進 records（那張表是一人一天一列）。
--
-- shared 預設 false：金額比睡眠分數敏感得多，而且送進聊天室就收不回來，
-- 所以預設不分享，由使用者一筆一筆自己勾。
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

-- 與其他表一致：不建任何 policy，只有帶 service_role key 的 server routes 進得來
alter table expenses enable row level security;
