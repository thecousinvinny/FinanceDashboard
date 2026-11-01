-- Security hardening after a full audit (2026-11-01).
--
-- Every table already has RLS with one owner_all policy TO authenticated, so
-- none of the below was readable — these remove the permissions underneath
-- so a future policy mistake can't expose anything.

-- 1. Synced appearance settings (theme, accent colors, week start, hoard
--    goal, hidden calendars) — lib/ui-prefs.ts. Covered by profiles owner_all.
alter table public.profiles add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

-- 2. Signed-out visitors (anon) had SELECT on 10 tables and the ledger view.
--    The app never queries as anon; take every privilege away, including on
--    tables created later.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 3. TRUNCATE bypasses RLS entirely, and REFERENCES / TRIGGER aren't needed by
--    an API client. Signed-in users keep exactly select/insert/update/delete.
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 4. Avatars: public reads go through the public URL (no policy needed), so
--    the "Public read" policy only let anyone list every file — and with it
--    every user id. Replacing an avatar (upload with upsert) still needs
--    SELECT, so owners keep it for their own folder only. Uploads are limited
--    to small images.
drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Users read own avatar" on storage.objects;
create policy "Users read own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
update storage.buckets
   set file_size_limit = 5242880,   -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
 where id = 'avatars';
