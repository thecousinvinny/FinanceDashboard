alter table cal_events add column if not exists recurrence_rule       text;
alter table cal_events add column if not exists recurrence_exceptions  text[] default '{}';
alter table cal_events add column if not exists recurrence_parent_id   uuid references cal_events(id) on delete set null;
