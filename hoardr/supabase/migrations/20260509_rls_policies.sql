-- Re-enable RLS with per-user policies for all Hoardr tables.
-- Run this in Supabase SQL Editor after the import is complete.

-- ── Helper: drop any existing policies before recreating ────────────────────
-- (safe to re-run)

DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('categories','banks','cards','expenses','income',
                        'subscriptions','wishlist','commissions','profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── Enable RLS ───────────────────────────────────────────────────────────────
ALTER TABLE categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE income       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;

-- ── Policies: each user sees and touches only their own rows ─────────────────

CREATE POLICY owner_all ON categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON banks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON income
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON wishlist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON commissions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY owner_all ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
