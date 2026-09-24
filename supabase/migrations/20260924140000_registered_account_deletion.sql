-- Corrección controlada de cuentas registradas por error.
-- Una cuenta detectada eliminada queda excluida del alta para que el inventario
-- persistente de NinjaTrader no vuelva a ofrecerla como si fuera nueva.

create table if not exists public.ninja_account_registration_exclusions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  connection_name text not null,
  external_account_name text not null,
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(owner_user_id, connector_id, connection_name, external_account_name),
  constraint ninja_account_registration_exclusions_connection_present
    check (length(btrim(connection_name)) between 1 and 160),
  constraint ninja_account_registration_exclusions_account_present
    check (length(btrim(external_account_name)) between 1 and 200),
  constraint ninja_account_registration_exclusions_reason_present
    check (length(btrim(reason)) between 1 and 500)
);

create index if not exists ninja_account_registration_exclusions_owner_idx
on public.ninja_account_registration_exclusions(owner_user_id, created_at desc);

alter table public.ninja_account_registration_exclusions enable row level security;

drop policy if exists ninja_account_registration_exclusions_read_own
on public.ninja_account_registration_exclusions;
create policy ninja_account_registration_exclusions_read_own
on public.ninja_account_registration_exclusions for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and public.is_current_user_active()
);

revoke all on table public.ninja_account_registration_exclusions from public, anon;
revoke insert, update, delete on table public.ninja_account_registration_exclusions from authenticated;
grant select on table public.ninja_account_registration_exclusions to authenticated;

comment on table public.ninja_account_registration_exclusions is
  'Cuentas Ninja cuyo registro fue corregido por el titular y que no deben volver a ofrecerse desde inventarios históricos.';

create or replace function public.delete_nodal_registered_account(
  target_account_id uuid,
  management_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_account public.accounts%rowtype;
  selected_workspace_id uuid;
  normalized_reason text := nullif(btrim(management_reason), '');
  links_snapshot jsonb;
  purchase_snapshot jsonb;
  identity_snapshot jsonb;
  selected_link public.ninja_account_links%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'registered_account_reason_invalid';
  end if;

  select accounts.*
  into selected_account
  from public.accounts accounts
  join public.periods periods on periods.id = accounts.period_id
  where accounts.id = target_account_id
    and public.can_access_workspace(periods.workspace_id)
  for update of accounts;

  if not found then
    raise exception 'registered_account_not_available';
  end if;
  select periods.workspace_id
  into selected_workspace_id
  from public.periods periods
  where periods.id = selected_account.period_id;
  if selected_account.state not in ('virgin', 'closed') then
    raise exception 'registered_account_state_not_deletable';
  end if;

  if exists(select 1 from public.daily_controls where leader_account_id = target_account_id)
    or exists(select 1 from public.daily_control_participants where account_id = target_account_id)
    or exists(select 1 from public.operation_entries where account_id = target_account_id)
    or exists(select 1 from public.account_phase_withdrawals where account_id = target_account_id)
    or exists(select 1 from public.manual_account_balance_observations where account_id = target_account_id)
    or exists(select 1 from public.funding_withdrawals where account_id = target_account_id)
    or exists(select 1 from public.ninja_operation_batch_members where account_id = target_account_id)
    or exists(select 1 from public.ninja_operation_batch_manual_accounts where account_id = target_account_id) then
    raise exception 'registered_account_has_activity';
  end if;

  select coalesce(jsonb_agg(to_jsonb(links) order by links.linked_at), '[]'::jsonb)
  into links_snapshot
  from public.ninja_account_links links
  where links.account_id = target_account_id;

  select to_jsonb(purchases)
  into purchase_snapshot
  from public.purchases purchases
  where purchases.account_id = target_account_id;

  select coalesce(jsonb_agg(to_jsonb(assignments) order by assignments.assigned_at), '[]'::jsonb)
  into identity_snapshot
  from public.identity_account_assignments assignments
  where assignments.account_id = target_account_id;

  for selected_link in
    select links.*
    from public.ninja_account_links links
    where links.account_id = target_account_id
  loop
    if selected_link.connector_id is not null then
      insert into public.ninja_account_registration_exclusions(
        owner_user_id,
        connector_id,
        connection_name,
        external_account_name,
        reason,
        created_by
      ) values (
        actor_id,
        selected_link.connector_id,
        btrim(selected_link.connection_name),
        btrim(selected_link.external_account_name),
        normalized_reason,
        actor_id
      )
      on conflict(owner_user_id, connector_id, connection_name, external_account_name)
      do update set reason = excluded.reason, created_by = excluded.created_by, created_at = now();
    end if;
  end loop;

  insert into public.audit_events(
    actor_user_id,
    entity_table,
    entity_id,
    action,
    previous_data,
    reason
  ) values (
    actor_id,
    'accounts',
    target_account_id,
    'registered_account_deleted',
    jsonb_build_object(
      'account', to_jsonb(selected_account),
      'purchase', purchase_snapshot,
      'ninja_links', links_snapshot,
      'identity_assignments', identity_snapshot,
      'workspace_id', selected_workspace_id
    ),
    normalized_reason
  );

  delete from public.identity_account_assignments where account_id = target_account_id;
  delete from public.ninja_account_links where account_id = target_account_id;
  delete from public.purchases where account_id = target_account_id;
  delete from public.accounts where id = target_account_id;

  return true;
end;
$$;

revoke all on function public.delete_nodal_registered_account(uuid, text)
from public, anon;
grant execute on function public.delete_nodal_registered_account(uuid, text)
to authenticated;

comment on function public.delete_nodal_registered_account(uuid, text) is
  'Elimina como corrección una cuenta virgen o cerrada sin actividad y conserva una exclusión Ninja más auditoría completa.';
