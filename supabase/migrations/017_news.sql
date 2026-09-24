-- 017：每日新聞與每日一句
--
-- 每天 09:00 的排程產生好存在這裡，有人打「新聞」「AI新聞」時直接讀出來回覆，
-- 不當場呼叫 AI（抓十幾個來源再整理要幾十秒，LINE 的回覆等不了那麼久）。
-- 內容是公開新聞與一句英文，不含任何人的資料。
create table if not exists news_digests (
  kind        text not null check (kind in ('health', 'ai', 'quote')),
  digest_date date not null,
  content     jsonb not null,
  created_at  timestamptz default now(),
  primary key (kind, digest_date)
);

alter table news_digests enable row level security;
