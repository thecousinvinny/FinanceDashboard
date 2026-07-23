-- Self-service session management: let a user list and revoke their OWN auth
-- sessions from the app (Settings → Devices & Sessions).
--
-- These are SECURITY DEFINER because they read/delete from the `auth` schema,
-- which is not exposed to the API. Every statement is scoped to auth.uid(), so a
-- caller can only ever see or kill their own sessions. search_path is locked and
-- EXECUTE is granted to `authenticated` only (never anon/public) — see the RLS
-- notes in CLAUDE.md about SECURITY DEFINER functions defaulting to PUBLIC.

create or replace function public.list_my_sessions()
returns table (
  id           uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  refreshed_at timestamp,
  not_after    timestamptz,
  user_agent   text,
  ip           text,
  is_current   boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.refreshed_at,
    s.not_after,
    s.user_agent,
    host(s.ip),
    coalesce(s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid, false)
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at, s.updated_at::timestamp, s.created_at::timestamp) desc
$$;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- Verify ownership BEFORE touching anything so a caller can't delete another
  -- user's session (or their refresh tokens) by guessing an id.
  select s.user_id into v_owner from auth.sessions s where s.id = p_session_id;
  if v_owner is null or v_owner <> auth.uid() then
    return false;
  end if;
  delete from auth.sessions where id = p_session_id;  -- cascades to auth.refresh_tokens
  return true;
end;
$$;

revoke all on function public.list_my_sessions()        from public, anon;
revoke all on function public.revoke_my_session(uuid)   from public, anon;
grant execute on function public.list_my_sessions()      to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
