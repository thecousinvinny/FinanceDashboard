-- Add icon, color, and tx_type to categories; add unique constraint for upsert.
alter table categories
  add column if not exists icon    text not null default 'LayoutGrid',
  add column if not exists color   text not null default '#D4AF37',
  add column if not exists tx_type text not null default 'Expense';

-- Required for upsert onConflict: 'user_id,name'
alter table categories
  drop constraint if exists categories_user_id_name_key;

alter table categories
  add constraint categories_user_id_name_key unique (user_id, name);
