-- Wishlist items can now be marked Delivered (arrived) with a delivery date.
-- Previously "mark arrived" deleted the row; it now transitions Ordered -> Delivered
-- and records delivered_at, so acquired items persist with paid + delivery dates.
alter type wishlist_status add value if not exists 'Delivered';
alter table wishlist add column if not exists delivered_at text;
