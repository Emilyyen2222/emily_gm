-- 020：新聞多一類「股市」
--
-- news_digests.kind 原本有 check 限制只能是 health / ai / quote，
-- 不放寬的話，排程寫入股市新聞時會被資料庫擋下來。
-- 017 建表時 check 沒有命名，Postgres 自動命名為 news_digests_kind_check。
-- 先刪再建，可以重複執行；不動到任何現有資料。
alter table news_digests drop constraint if exists news_digests_kind_check;
alter table news_digests
  add constraint news_digests_kind_check check (kind in ('health', 'ai', 'stock', 'quote'));
