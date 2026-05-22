-- Add icon, color, and tx_type to categories so users can customize them.
alter table categories
  add column if not exists icon    text not null default 'LayoutGrid',
  add column if not exists color   text not null default '#D4AF37',
  add column if not exists tx_type text not null default 'Expense';
