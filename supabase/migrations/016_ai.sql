-- 016：AI 問答
--
-- 同意與否存在 users 上，跟 habits、expense_label 一樣是「這個人的設定」。
-- 還沒按過同意卡片的人 ai_consent 是 null —— 這跟「選了不要」是兩回事，
-- 前者要先問，後者照樣回答一般問題、只是不讀紀錄。
alter table users add column if not exists ai_consent text
  check (ai_consent in ('granted', 'declined'));
alter table users add column if not exists ai_consent_at timestamptz;
-- 第一次發問時先存下來，按下同意卡片的按鈕後直接回答這一題
alter table users add column if not exists ai_pending_question text;

-- 每人每天的使用次數。只有這個上限擋在「有人狂問把 US$5 一次燒光」前面
create table if not exists ai_usage (
  user_id    text not null,
  usage_date date not null,
  count      smallint not null default 0,
  primary key (user_id, usage_date)
);

alter table ai_usage enable row level security;

-- 「還沒到上限就 +1」必須是一個不可分割的動作。
-- 分成先讀再寫兩步，同一個人連發兩則訊息時兩邊都會讀到 29，都放行。
-- 回傳 true 代表這次可以問（已經記上一筆），false 代表今天的額度用完了。
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

-- 預設所有角色都能執行 function，收回來只留給 service_role
revoke execute on function ai_usage_take(text, date, smallint) from public, anon, authenticated;
