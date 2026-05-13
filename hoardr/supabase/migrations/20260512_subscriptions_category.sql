-- Add category text column to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS category text;
