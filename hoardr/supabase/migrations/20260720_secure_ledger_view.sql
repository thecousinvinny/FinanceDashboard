-- Close the two holes that survived enabling RLS on the tables.
--
-- 1. `ledger` is a view, and views run with their *owner's* privileges unless
--    security_invoker is set. It is owned by postgres, so it read straight
--    through the new RLS policies: with the anon key and no login,
--    /rest/v1/ledger still returned expenses, income and subscription rows
--    after every underlying table was locked down. security_invoker = on makes
--    the view evaluate against the querying user, so RLS applies normally.
--    (Requires Postgres 15+; this project is on 17.)
--
-- 2. `handle_new_user()` is the SECURITY DEFINER signup trigger on auth.users.
--    It had no explicit ACL, which means EXECUTE defaulted to PUBLIC and it was
--    reachable as /rest/v1/rpc/handle_new_user by anonymous callers. EXECUTE is
--    revoked and re-granted only to the roles in the real signup path — the
--    grant to supabase_auth_admin is what keeps the trigger firing.

ALTER VIEW public.ledger SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO postgres, supabase_auth_admin, service_role;
