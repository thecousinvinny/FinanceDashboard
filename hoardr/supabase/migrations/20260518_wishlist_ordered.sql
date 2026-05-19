alter type wishlist_status add value if not exists 'Ordered';
alter table wishlist add column if not exists ordered_at text;
