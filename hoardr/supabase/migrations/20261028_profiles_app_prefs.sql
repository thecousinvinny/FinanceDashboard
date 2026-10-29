-- App defaults (default bank, expense category, billing cycle) used to live
-- only in each browser's localStorage, so a default set on one device didn't
-- exist on another. Store them on the profile so every device agrees.
-- Covered by the existing profiles owner_all RLS policy.
alter table public.profiles add column if not exists app_prefs jsonb not null default '{}'::jsonb;
