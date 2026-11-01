-- Two gaps found in the API logs (every check 400 / 403):
--
-- 1. 20261028_profiles_app_prefs.sql was never applied, so syncing default
--    card / bank / category across devices failed on every check.
alter table public.profiles add column if not exists app_prefs jsonb not null default '{}'::jsonb;

-- 2. transfers had RLS and its owner_all policy but no table privileges for
--    signed-in users, so every read and write was refused (In → recent
--    transfers never loaded). Authenticated only: anon gets nothing, and
--    owner_all still scopes every row to auth.uid().
grant select, insert, update, delete on table public.transfers to authenticated;
