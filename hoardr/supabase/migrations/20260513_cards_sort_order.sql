alter table cards
  add column if not exists sort_order integer not null default 999;

-- Initialize sort_order based on current display order
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by is_default desc, created_at asc
    ) - 1 as rn
  from cards
)
update cards c
set sort_order = r.rn
from ranked r
where c.id = r.id;
