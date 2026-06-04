-- Add avatar_url to profiles
alter table profiles
  add column if not exists avatar_url text;

-- Create avatars storage bucket (public so images load without auth headers)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS: authenticated users can upload / update their own folder
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: anyone (including unauthenticated) can read avatars
create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
