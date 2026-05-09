-- Add category, url, and bought_cost columns to wishlist table
ALTER TABLE wishlist
  ADD COLUMN IF NOT EXISTS category   text,
  ADD COLUMN IF NOT EXISTS url        text,
  ADD COLUMN IF NOT EXISTS bought_cost numeric;
