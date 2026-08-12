-- Guardado transaccional inicial de Control Diario y registros derivados.
-- No conecta todavia NinjaTrader: solo prepara un destino seguro y auditable.

create type public.daily_control_kind as enum (
  'deposit',
  'withdrawal',
  'balance_update'
);

create type public.daily_control_source as enum ('manual', 'ninjatrader');

create type public.daily_control_origin_destination as enum (
  'Aporte trader',
  'Saldo billetera',
  'Retiro personal'
);

create type public.operation_phase as enum (
  'Evaluacion',
  'Primera vuelta',
  'Segunda vuelta',
  'Tercera vuelta',
  'Cuarta vuelta',
  'Quinta vuelta'
);

create type public.daily_control_participant_role as enum ('leader', 'replica');

create type public.broker_result_destination as enum (
  'NETO BROKER +',
  'NETO BROKER -',
  'NONE'
);

create table public.daily_controls (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods (id) on delete restrict,
  control_number integer not null,
  operated_on date not null,
  kind public.daily_control_kind not null,
  movement_cents bigint,
  origin_destination public.daily_control_origin_destination,
  balance_before_cents bigint,
  balance_after_cents bigint not null,
  operating_result_cents bigint,
  company_id uuid references public.companies (id) on delete restrict,
  leader_account_id uuid,
  phase public.operation_phase,
  observations text,
  source public.daily_control_source not null,
  source_event_key text,
  received_balance_cents bigint,
  sync_issue_reason text,
  confirmation_key uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (period_id, control_number),
  unique (created_by, confirmation_key),
  unique (id, period_id),
  foreign key (leader_account_id, period_id)
    references public.accounts (id, period_id) on delete restrict,
  constraint daily_controls_number_positive check (control_number > 0),
  constraint daily_controls_balances_nonnegative check (
    (balance_before_cents is null or balance_before_cents >= 0)
    and balance_after_cents >= 0
  ),
  constraint daily_controls_movement_nonnegative check (
    movement_cents is null or movement_cents >= 0
  ),
  constraint daily_controls_observations_present check (
    observations is null or btrim(observations) <> ''
  ),
  constraint daily_controls_source_event_present check (
    source_event_key is null or btrim(source_event_key) <> ''
  ),
  constraint daily_controls_sync_reason_present check (
    sync_issue_reason is null or btrim(sync_issue_reason) <> ''
  ),
  constraint daily_controls_kind_shape check (
    (
      kind in ('deposit', 'withdrawal')
      and movement_cents is not null
      and origin_destination is not null
      and operating_result_cents is null
      and company_id is null
      and leader_account_id is null
      and phase is null
      and source = 'manual'
      and source_event_key is null
      and received_balance_cents is null
      and sync_issue_reason is null
    )
    or
    (
      kind = 'balance_update'
      and movement_cents is null
      and origin_destination is null
      and balance_before_cents is not null
      and operating_result_cents is not null
      and company_id is not null
      and leader_account_id is not null
      and phase is not null
      and (
        (source = 'manual'
          and source_event_key is null
          and received_balance_cents is null
          and sync_issue_reason is null)
        or
        (source = 'ninjatrader'
          and source_event_key is not null
          and received_balance_cents is not null
          and (
            (received_balance_cents = balance_after_cents and sync_issue_reason is null)
            or
            (received_balance_cents is distinct from balance_after_cents
              and sync_issue_reason is not null)
          ))
      )
    )
  ),
  constraint daily_controls_result_matches_balance check (
    operating_result_cents is null
    or operating_result_cents = balance_after_cents - balance_before_cents
  )
);

create unique index daily_controls_ninjatrader_event_unique
on public.daily_controls (period_id, source_event_key)
where source = 'ninjatrader';

create table public.daily_control_participants (
  daily_control_id uuid not null,
  period_id uuid not null,
  account_id uuid not null,
  role public.daily_control_participant_role not null,
  allocated_result_cents bigint not null,
  created_at timestamptz not null default now(),
  primary key (daily_control_id, account_id),
  foreign key (daily_control_id, period_id)
    references public.daily_controls (id, period_id) on delete restrict,
  foreign key (account_id, period_id)
    references public.accounts (id, period_id) on delete restrict
);

create unique index daily_control_one_leader
on public.daily_control_participants (daily_control_id)
where role = 'leader';

create table public.operation_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods (id) on delete restrict,
  daily_control_id uuid not null,
  account_id uuid not null,
  operated_on date not null,
  phase public.operation_phase not null,
  participant_role public.daily_control_participant_role not null,
  destination public.broker_result_destination not null,
  magnitude_cents bigint not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (daily_control_id, account_id),
  foreign key (daily_control_id, period_id)
    references public.daily_controls (id, period_id) on delete restrict,
  foreign key (account_id, period_id)
    references public.accounts (id, period_id) on delete restrict,
  constraint operation_entries_magnitude_nonnegative check (magnitude_cents >= 0),
  constraint operation_entries_none_is_zero check (
    (destination = 'NONE' and magnitude_cents = 0)
    or (destination <> 'NONE' and magnitude_cents > 0)
  )
);

create index daily_controls_period_order_idx
on public.daily_controls (period_id, control_number desc);
create index daily_control_participants_account_idx
on public.daily_control_participants (account_id, daily_control_id);
create index operation_entries_account_date_idx
on public.operation_entries (account_id, operated_on, created_at);

create trigger daily_controls_set_updated_at
before update on public.daily_controls
for each row execute function public.set_updated_at();

create trigger operation_entries_set_updated_at
before update on public.operation_entries
for each row execute function public.set_updated_at();

alter table public.daily_controls enable row level security;
alter table public.daily_control_participants enable row level security;
alter table public.operation_entries enable row level security;

create policy daily_controls_read_own
on public.daily_controls for select to authenticated
using (public.can_access_period(period_id));

create policy daily_control_participants_read_own
on public.daily_control_participants for select to authenticated
using (public.can_access_period(period_id));

create policy operation_entries_read_own
on public.operation_entries for select to authenticated
using (public.can_access_period(period_id));

revoke all on table public.daily_controls from anon;
revoke all on table public.daily_control_participants from anon;
revoke all on table public.operation_entries from anon;
revoke insert, update, delete on table public.daily_controls from authenticated;
revoke insert, update, delete on table public.daily_control_participants from authenticated;
revoke insert, update, delete on table public.operation_entries from authenticated;
grant select on table public.daily_controls to authenticated;
grant select on table public.daily_control_participants to authenticated;
grant select on table public.operation_entries to authenticated;

create function public.confirm_nodal_daily_control(
  target_period_id uuid,
  target_kind public.daily_control_kind,
  target_operated_on date,
  target_confirmation_key uuid,
  target_amount_cents bigint default null,
  target_balance_cents bigint default null,
  target_origin_destination public.daily_control_origin_destination default null,
  target_company_id uuid default null,
  target_leader_account_id uuid default null,
  target_replica_account_ids uuid[] default array[]::uuid[],
  target_phase public.operation_phase default null,
  target_observations text default null,
  target_source public.daily_control_source default 'manual',
  target_source_event_key text default null,
  target_received_balance_cents bigint default null,
  target_sync_issue_reason text default null
)
returns table (
  daily_control_id uuid,
  control_number integer,
  balance_after_cents bigint,
  operating_result_cents bigint,
  operation_entries_created integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_period_month date;
  prior_control record;
  next_control_number integer;
  calculated_balance_after bigint;
  calculated_result bigint;
  participant_ids uuid[];
  participant_count integer;
  matching_accounts integer;
  allocated_result bigint;
  new_control_id uuid;
  existing_control record;
  destination public.broker_result_destination;
  inserted_entries integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if target_confirmation_key is null or target_operated_on is null then
    raise exception 'Confirmation key and operation date are required';
  end if;

  target_replica_account_ids := coalesce(target_replica_account_ids, array[]::uuid[]);

  select controls.id, controls.control_number, controls.balance_after_cents,
    controls.operating_result_cents
  into existing_control
  from public.daily_controls as controls
  where controls.created_by = actor_id
    and controls.confirmation_key = target_confirmation_key;

  if found then
    return query select existing_control.id, existing_control.control_number,
      existing_control.balance_after_cents,
      existing_control.operating_result_cents,
      (select count(*)::integer from public.operation_entries as entries
       where entries.daily_control_id = existing_control.id);
    return;
  end if;

  select periods.period_month
  into selected_period_month
  from public.periods as periods
  join public.workspaces as spaces on spaces.id = periods.workspace_id
  join public.nodal_users as users on users.id = spaces.owner_user_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and users.access_state = 'active'
  for update of periods;

  if not found then
    raise exception 'The selected period is not available to this user';
  end if;

  if date_trunc('month', target_operated_on)::date <> selected_period_month then
    raise exception 'The operation date must belong to the selected period';
  end if;

  if target_source = 'ninjatrader' and nullif(btrim(target_source_event_key), '') is not null then
    select controls.id, controls.control_number, controls.balance_after_cents,
      controls.operating_result_cents
    into existing_control
    from public.daily_controls as controls
    where controls.period_id = target_period_id
      and controls.source = 'ninjatrader'
      and controls.source_event_key = btrim(target_source_event_key);

    if found then
      return query select existing_control.id, existing_control.control_number,
        existing_control.balance_after_cents,
        existing_control.operating_result_cents,
        (select count(*)::integer from public.operation_entries as entries
         where entries.daily_control_id = existing_control.id);
      return;
    end if;
  end if;

  select controls.control_number, controls.operated_on, controls.balance_after_cents
  into prior_control
  from public.daily_controls as controls
  where controls.period_id = target_period_id
  order by controls.control_number desc
  limit 1;

  if found and target_operated_on < prior_control.operated_on then
    raise exception 'Earlier entries require the controlled correction flow';
  end if;

  next_control_number := coalesce(prior_control.control_number, 0) + 1;

  if target_kind = 'deposit' then
    if target_amount_cents is null or target_amount_cents < 0
      or target_origin_destination is null then
      raise exception 'A deposit requires a nonnegative amount and origin';
    end if;
    if target_company_id is not null or target_leader_account_id is not null
      or cardinality(target_replica_account_ids) > 0 or target_phase is not null then
      raise exception 'Capital movements cannot include operational accounts';
    end if;
    if target_balance_cents is not null then
      raise exception 'A deposit calculates its balance and cannot receive one';
    end if;
    calculated_balance_after := coalesce(prior_control.balance_after_cents, 0)
      + target_amount_cents;
    calculated_result := null;
  elsif target_kind = 'withdrawal' then
    if prior_control.balance_after_cents is null then
      raise exception 'A withdrawal requires a previous confirmed balance';
    end if;
    if target_amount_cents is null or target_amount_cents < 0
      or target_origin_destination is null then
      raise exception 'A withdrawal requires a nonnegative amount and destination';
    end if;
    if target_amount_cents > prior_control.balance_after_cents then
      raise exception 'A withdrawal cannot exceed the confirmed balance';
    end if;
    if target_company_id is not null or target_leader_account_id is not null
      or cardinality(target_replica_account_ids) > 0 or target_phase is not null then
      raise exception 'Capital movements cannot include operational accounts';
    end if;
    if target_balance_cents is not null then
      raise exception 'A withdrawal calculates its balance and cannot receive one';
    end if;
    calculated_balance_after := prior_control.balance_after_cents - target_amount_cents;
    calculated_result := null;
  elsif target_kind = 'balance_update' then
    if prior_control.balance_after_cents is null then
      raise exception 'The first confirmed entry must be a deposit';
    end if;
    if target_balance_cents is null or target_balance_cents < 0 then
      raise exception 'A balance update requires a nonnegative balance';
    end if;
    if target_amount_cents is not null or target_origin_destination is not null then
      raise exception 'A balance update cannot include a capital movement';
    end if;
    if target_company_id is null or target_leader_account_id is null
      or target_phase is null then
      raise exception 'Company, leader and phase are required';
    end if;
    if target_leader_account_id = any(target_replica_account_ids) then
      raise exception 'The leader cannot also be a replica';
    end if;
    participant_ids := array_prepend(target_leader_account_id, target_replica_account_ids);
    participant_count := cardinality(participant_ids);
    if participant_count > 250 then
      raise exception 'No more than 250 accounts can participate';
    end if;
    if (select count(distinct account_id)
        from unnest(participant_ids) as participant(account_id))
      <> participant_count then
      raise exception 'Participant accounts cannot be repeated';
    end if;

    select count(*)::integer
    into matching_accounts
    from public.accounts as accounts
    where accounts.id = any(participant_ids)
      and accounts.period_id = target_period_id
      and accounts.company_id = target_company_id;

    if matching_accounts <> participant_count then
      raise exception 'All participants must belong to the selected company and period';
    end if;

    calculated_balance_after := target_balance_cents;
    calculated_result := target_balance_cents - prior_control.balance_after_cents;

    if mod(calculated_result, participant_count) <> 0 then
      raise exception 'The result cannot be divided into exact cents';
    end if;
    allocated_result := calculated_result / participant_count;

    if target_source = 'ninjatrader' then
      if nullif(btrim(target_source_event_key), '') is null
        or target_received_balance_cents is null then
        raise exception 'NinjaTrader entries require event key and received balance';
      end if;
      if target_received_balance_cents is distinct from target_balance_cents
        and nullif(btrim(target_sync_issue_reason), '') is null then
        raise exception 'A corrected broker balance requires a synchronization reason';
      end if;
      if target_received_balance_cents = target_balance_cents
        and target_sync_issue_reason is not null then
        raise exception 'A synchronization reason requires a corrected balance';
      end if;
    elsif target_source_event_key is not null
      or target_received_balance_cents is not null
      or target_sync_issue_reason is not null then
      raise exception 'Manual entries cannot include broker synchronization data';
    end if;
  else
    raise exception 'Unsupported daily control kind';
  end if;

  if target_kind <> 'balance_update' and target_source <> 'manual' then
    raise exception 'Capital movements are manual in this initial version';
  end if;

  insert into public.daily_controls (
    period_id, control_number, operated_on, kind, movement_cents,
    origin_destination, balance_before_cents, balance_after_cents,
    operating_result_cents, company_id, leader_account_id, phase,
    observations, source, source_event_key, received_balance_cents,
    sync_issue_reason, confirmation_key, created_by
  )
  values (
    target_period_id, next_control_number, target_operated_on, target_kind,
    case when target_kind in ('deposit', 'withdrawal') then target_amount_cents end,
    case when target_kind in ('deposit', 'withdrawal') then target_origin_destination end,
    prior_control.balance_after_cents, calculated_balance_after, calculated_result,
    case when target_kind = 'balance_update' then target_company_id end,
    case when target_kind = 'balance_update' then target_leader_account_id end,
    case when target_kind = 'balance_update' then target_phase end,
    nullif(btrim(target_observations), ''), target_source,
    nullif(btrim(target_source_event_key), ''), target_received_balance_cents,
    nullif(btrim(target_sync_issue_reason), ''), target_confirmation_key, actor_id
  )
  returning id into new_control_id;

  if target_kind = 'balance_update' then
    insert into public.daily_control_participants (
      daily_control_id, period_id, account_id, role, allocated_result_cents
    )
    select new_control_id, target_period_id, participant.account_id,
      case when participant.ordinality = 1 then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      allocated_result
    from unnest(participant_ids) with ordinality as participant(account_id, ordinality);

    destination := case
      when allocated_result > 0 then 'NETO BROKER +'::public.broker_result_destination
      when allocated_result < 0 then 'NETO BROKER -'::public.broker_result_destination
      else 'NONE'::public.broker_result_destination
    end;

    insert into public.operation_entries (
      period_id, daily_control_id, account_id, operated_on, phase,
      participant_role, destination, magnitude_cents, created_by
    )
    select target_period_id, new_control_id, participant.account_id,
      target_operated_on, target_phase,
      case when participant.ordinality = 1 then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      destination, abs(allocated_result), actor_id
    from unnest(participant_ids) with ordinality as participant(account_id, ordinality);
    get diagnostics inserted_entries = row_count;
  end if;

  insert into public.audit_events (
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  values (
    actor_id, 'daily_controls', new_control_id, 'daily_control_confirmed',
    jsonb_build_object(
      'period_id', target_period_id,
      'control_number', next_control_number,
      'operated_on', target_operated_on,
      'kind', target_kind,
      'balance_before_cents', prior_control.balance_after_cents,
      'balance_after_cents', calculated_balance_after,
      'operating_result_cents', calculated_result,
      'company_id', target_company_id,
      'leader_account_id', target_leader_account_id,
      'replica_account_ids', target_replica_account_ids,
      'phase', target_phase,
      'source', target_source,
      'source_event_key', target_source_event_key,
      'received_balance_cents', target_received_balance_cents,
      'sync_issue_reason', target_sync_issue_reason,
      'operation_entries_created', inserted_entries
    ),
    'Control Diario confirmado por el usuario'
  );

  return query select new_control_id, next_control_number,
    calculated_balance_after, calculated_result, inserted_entries;
end;
$$;

revoke all on function public.confirm_nodal_daily_control(
  uuid, public.daily_control_kind, date, uuid, bigint, bigint,
  public.daily_control_origin_destination, uuid, uuid, uuid[],
  public.operation_phase, text, public.daily_control_source, text, bigint, text
) from public, anon;

grant execute on function public.confirm_nodal_daily_control(
  uuid, public.daily_control_kind, date, uuid, bigint, bigint,
  public.daily_control_origin_destination, uuid, uuid, uuid[],
  public.operation_phase, text, public.daily_control_source, text, bigint, text
) to authenticated;
