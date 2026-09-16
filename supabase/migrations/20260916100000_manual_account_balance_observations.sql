-- Cash value informado para cuentas operadas fuera del NinjaTrader vinculado.
-- Es una observación operativa; no crea por sí sola un resultado contable.

create table public.manual_account_balance_observations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null,
  account_id uuid not null,
  initial_balance_cents bigint not null check (initial_balance_cents >= 0),
  cash_value_cents bigint not null check (cash_value_cents >= 0),
  trade_number integer not null check (trade_number > 0),
  observed_at timestamptz not null,
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (account_id, trade_number),
  foreign key (account_id, period_id)
    references public.accounts(id, period_id) on delete cascade
);

create index manual_account_balance_observations_latest_idx
on public.manual_account_balance_observations(account_id, observed_at desc, created_at desc);

alter table public.manual_account_balance_observations enable row level security;

comment on table public.manual_account_balance_observations is
  'Saldos prop observados fuera del conector; mantienen continuidad operativa sin inventar la contraparte broker.';
