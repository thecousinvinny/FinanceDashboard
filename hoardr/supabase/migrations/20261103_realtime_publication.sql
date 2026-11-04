-- Live updates across devices (src/lib/live-sync.ts). Realtime applies each
-- table's RLS policy to every change, so a session only hears its own rows.
alter publication supabase_realtime add table
  public.expenses, public.income, public.subscriptions, public.wishlist,
  public.banks, public.cards, public.transfers, public.revenue_streams,
  public.categories, public.cal_events;
