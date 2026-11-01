-- Custom subscription cycles: "every N days / weeks / months / years".
-- billing = 'Custom' uses billing_every + billing_unit; the five presets ignore them.
alter type billing_cycle add value if not exists 'Custom';

alter table public.subscriptions
  add column if not exists billing_every smallint,
  add column if not exists billing_unit  text;

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_custom_chk;
alter table public.subscriptions
  add constraint subscriptions_billing_custom_chk check (
    (billing_every is null or billing_every between 1 and 999)
    and (billing_unit is null or billing_unit in ('day', 'week', 'month', 'year'))
  );
