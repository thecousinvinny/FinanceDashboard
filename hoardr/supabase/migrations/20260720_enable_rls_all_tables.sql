-- Enable RLS everywhere and normalise the policy set.
--
-- Nine tables (expenses, income, banks, cards, categories, commissions,
-- profiles, subscriptions, wishlist) had correct owner policies defined but
-- `relrowsecurity = false`, so Postgres never evaluated them. Because the anon
-- key ships in the client bundle, every row in those tables was world-readable
-- and world-writable.
--
-- RLS had been switched off while debugging write failures, but the policies
-- were never the cause: the sessions were dying (middleware was not carrying
-- rotated auth cookies onto redirects, so the refresh token went stale and
-- auth.uid() silently became null). That is fixed separately; cal_events,
-- revenue_streams and transfers have run with RLS enabled throughout.
--
-- Policy hygiene, folded in here:
--   * banks / cards / commissions each carried three overlapping ALL policies
--   * categories carried an ALL policy plus four redundant per-command ones
--   * cal_events carried two policies differing only in capitalisation
--   * several omitted WITH CHECK (harmless — for ALL policies Postgres reuses
--     the USING expression — but inconsistent to read)
-- Every table is collapsed to a single `owner_all` policy.
--
-- Policies are scoped TO authenticated rather than the default `public`. The
-- predicate already excluded anon (auth.uid() is null there, and `null = uuid`
-- is NULL, never true), so this is defence in depth, not a behaviour change.

-- ── 1. Drop every existing policy on the target tables ─────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename IN (
        'expenses', 'income', 'banks', 'cards', 'categories', 'commissions',
        'profiles', 'subscriptions', 'wishlist',
        'cal_events', 'revenue_streams', 'transfers'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 2. One canonical owner policy per table ────────────────────────────────
-- profiles keys off `id`; every other table off `user_id`.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expenses', 'income', 'banks', 'cards', 'categories', 'commissions',
    'subscriptions', 'wishlist', 'cal_events', 'revenue_streams', 'transfers'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY owner_all ON public.%I FOR ALL TO authenticated
         USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY owner_all ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
