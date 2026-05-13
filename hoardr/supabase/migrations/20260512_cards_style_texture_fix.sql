-- Ensure style is plain text (removes any check constraint if one existed)
alter table cards alter column style type text;

-- Add texture column if it doesn't exist yet
alter table cards add column if not exists texture text not null default 'none';
