-- Add balance/APY/interest columns to banks table
alter table banks
  add column if not exists balance           numeric(12, 2),
  add column if not exists apy               numeric(5, 2),
  add column if not exists next_interest_date date,
  add column if not exists interest_freq     text check (interest_freq in ('Monthly', 'Quarterly'));

-- Revenue streams table (previously stored in localStorage)
create table if not exists revenue_streams (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users(id) on delete cascade not null,
  name          text        not null,
  amount        numeric(12, 2) not null,
  freq          text        not null check (freq in ('Weekly', 'Biweekly', 'Semimonthly', 'Monthly')),
  bank_id       uuid        references banks(id) on delete set null,
  next_pay_date date        not null,
  created_at    timestamptz not null default now()
);

alter table revenue_streams enable row level security;

create policy "Users can manage their own revenue streams"
  on revenue_streams for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
