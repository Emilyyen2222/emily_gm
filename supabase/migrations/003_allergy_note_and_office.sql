-- 003：過敏備註 + 離開公司時間
alter table records add column if not exists allergy_note      text;
alter table records add column if not exists leave_office_time time;
