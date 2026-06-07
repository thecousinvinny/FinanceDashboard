-- cal_events was missing RLS — add it now.
-- The table was created outside the initial rls_policies.sql migration.

ALTER TABLE cal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cal_events"
  ON cal_events FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
