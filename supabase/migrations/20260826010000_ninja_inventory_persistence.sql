create table public.ninja_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  machine_id text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  accounts jsonb not null,
  account_count integer not null,
  constraint ninja_inventory_snapshot_machine_present check (length(btrim(machine_id)) > 0),
  constraint ninja_inventory_snapshot_accounts_array check (jsonb_typeof(accounts) = 'array'),
  constraint ninja_inventory_snapshot_count_valid check (account_count >= 0 and account_count = jsonb_array_length(accounts))
);

create index ninja_inventory_snapshots_machine_observed_idx
on public.ninja_inventory_snapshots (machine_id, observed_at desc);

alter table public.ninja_inventory_snapshots enable row level security;
revoke all on table public.ninja_inventory_snapshots from public, anon, authenticated;
