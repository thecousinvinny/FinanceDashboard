CREATE TABLE IF NOT EXISTS transfers (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid    REFERENCES auth.users(id) ON DELETE CASCADE,
  from_bank_id uuid    REFERENCES banks(id) ON DELETE SET NULL,
  to_bank_id   uuid    REFERENCES banks(id) ON DELETE SET NULL,
  amount       numeric(10,2) NOT NULL,
  date         text    NOT NULL,
  note         text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own transfers"
  ON transfers FOR ALL
  USING (auth.uid() = user_id);
