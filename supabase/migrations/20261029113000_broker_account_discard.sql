-- Una instalación de Ninja puede observar particiones broker de distintas
-- personas. Ninguna cuenta descartada por el titular debe alimentar su saldo,
-- volver a ofrecerse para confirmación ni recibir telemetría en su contabilidad.

create table if not exists public.ninja_broker_account_exclusions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  account_name text not null,
  reason text not null,
  excluded_by uuid not null references auth.users(id) on delete restrict,
  excluded_at timestamptz not null default now(),
  unique(owner_user_id, account_name),
  constraint ninja_broker_account_exclusions_account_present
    check (length(btrim(account_name)) between 1 and 200),
  constraint ninja_broker_account_exclusions_reason_present
    check (length(btrim(reason)) between 1 and 500)
);

create index if not exists ninja_broker_account_exclusions_owner_idx
  on public.ninja_broker_account_exclusions(owner_user_id, excluded_at desc);

alter table public.ninja_broker_account_exclusions enable row level security;

drop policy if exists ninja_broker_account_exclusions_read_own
  on public.ninja_broker_account_exclusions;
create policy ninja_broker_account_exclusions_read_own
  on public.ninja_broker_account_exclusions for select to authenticated
  using (
    owner_user_id=(select auth.uid())
    and public.is_current_user_active()
  );

revoke all on table public.ninja_broker_account_exclusions from public,anon;
revoke insert,update,delete on table public.ninja_broker_account_exclusions from authenticated;
grant select on table public.ninja_broker_account_exclusions to authenticated;

comment on table public.ninja_broker_account_exclusions is
  'Números broker visibles en un Ninja compartido que el usuario declaró ajenos y que no deben ingresar a su contabilidad.';

create or replace function public.discard_ninja_broker_account(
  target_account_name text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=(select auth.uid());
  normalized_account text:=nullif(btrim(target_account_name),'');
  exclusion_id uuid;
begin
  if actor is null or not public.is_current_user_active() then
    raise exception 'Not authorized';
  end if;
  if normalized_account is null then raise exception 'Broker account is invalid'; end if;

  if not exists(
    select 1
    from public.ninja_account_ownership ownership
    where ownership.owner_user_id=actor
      and ownership.account_type='broker'
      and upper(btrim(ownership.account_name))=upper(normalized_account)
  ) and not exists(
    select 1
    from public.ninja_unclaimed_broker_accounts pending
    join public.ninja_connectors proposed
      on proposed.id=pending.proposed_destination_connector_id
    where proposed.owner_user_id=actor
      and upper(btrim(pending.account_name))=upper(normalized_account)
  ) then
    raise exception 'Broker account is not available';
  end if;

  insert into public.ninja_broker_account_exclusions(
    owner_user_id,account_name,reason,excluded_by
  ) values (
    actor,normalized_account,
    'Cuenta broker ajena observada desde una conexión o partición compartida',actor
  )
  on conflict(owner_user_id,account_name) do update set
    reason=excluded.reason,excluded_by=actor,excluded_at=now()
  returning id into exclusion_id;

  delete from public.ninja_account_ownership ownership
  where ownership.owner_user_id=actor
    and ownership.account_type='broker'
    and upper(btrim(ownership.account_name))=upper(normalized_account);

  delete from public.ninja_unclaimed_broker_accounts pending
  using public.ninja_connectors proposed
  where proposed.id=pending.proposed_destination_connector_id
    and proposed.owner_user_id=actor
    and upper(btrim(pending.account_name))=upper(normalized_account);

  insert into public.audit_events(
    actor_user_id,entity_table,entity_id,action,current_data,reason
  ) values (
    actor,'ninja_broker_account_exclusions',exclusion_id,
    'ninja_broker_account_discarded',
    jsonb_build_object('account_name',normalized_account),
    'El titular indicó que la partición broker detectada no pertenece a su contabilidad'
  );
  return true;
end;
$$;

revoke all on function public.discard_ninja_broker_account(text)
  from public,anon;
grant execute on function public.discard_ninja_broker_account(text)
  to authenticated;

comment on function public.discard_ninja_broker_account(text) is
  'Descarta por número una cuenta broker ajena sin bloquear las demás cuentas de la misma conexión Ninja.';

-- Las lecturas personales también filtran inmediatamente una cuenta descartada,
-- aunque el último snapshot se haya guardado antes de la decisión.
create or replace function public.get_current_user_ninja_inventory()
returns table(connector_id uuid, observed_at timestamptz, accounts jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with current_connector as (
    select connectors.id
    from public.ninja_connectors connectors
    where connectors.owner_user_id = (select auth.uid())
      and connectors.status = 'active'
      and public.is_current_user_active()
  ), latest as (
    select distinct on (snapshots.connector_id)
      snapshots.connector_id, snapshots.observed_at, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    join current_connector on current_connector.id = snapshots.connector_id
    order by snapshots.connector_id, snapshots.observed_at desc
  )
  select latest.connector_id, latest.observed_at,
    coalesce((
      select jsonb_agg(account || jsonb_build_object('firstSeenAt', (
        select min(history.observed_at)
        from public.ninja_inventory_snapshots history,
             jsonb_array_elements(history.accounts) historical_account
        where history.connector_id = latest.connector_id
          and historical_account->>'connectionName' = account->>'connectionName'
          and historical_account->>'accountName' = account->>'accountName'
      )))
      from jsonb_array_elements(latest.accounts) account
      where not exists (
        select 1
        from public.ninja_connector_connection_reviews reviews
        where reviews.connector_id = latest.connector_id
          and reviews.connection_name = account->>'connectionName'
          and reviews.status = 'isolated'
      )
      and not exists (
        select 1
        from public.ninja_broker_account_exclusions exclusions
        where exclusions.owner_user_id=(select auth.uid())
          and upper(btrim(exclusions.account_name))=
            upper(btrim(account->>'accountName'))
      )
    ), '[]'::jsonb)
  from latest;
$$;

revoke all on function public.get_current_user_ninja_inventory()
  from public,anon;
grant execute on function public.get_current_user_ninja_inventory()
  to authenticated;

-- Reparación puntual solicitada: Javier ve en su Ninja la partición 2177299
-- de Gastón, pero su contabilidad debe comenzar únicamente con 2292943.
with target as (
  select users.id as owner_user_id
  from public.nodal_users users
  where lower(users.email)=lower('toralesjavierv@gmail.com')
), excluded as (
  insert into public.ninja_broker_account_exclusions(
    owner_user_id,account_name,reason,excluded_by
  )
  select target.owner_user_id,'2177299',
    'Partición broker de Gastón visible en el Ninja compartido',target.owner_user_id
  from target
  on conflict(owner_user_id,account_name) do update set
    reason=excluded.reason,excluded_at=now()
  returning id,owner_user_id,account_name
), removed as (
  delete from public.ninja_account_ownership ownership
  using target
  where ownership.owner_user_id=target.owner_user_id
    and ownership.account_type='broker'
    and upper(btrim(ownership.account_name))='2177299'
  returning ownership.owner_user_id,ownership.physical_connector_id,
    ownership.connection_name,ownership.account_name
)
insert into public.audit_events(
  actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason
)
select excluded.owner_user_id,'ninja_broker_account_exclusions',excluded.id,
  'ninja_broker_partition_repaired',
  coalesce((select jsonb_agg(to_jsonb(removed)) from removed),'[]'::jsonb),
  jsonb_build_object('account_name',excluded.account_name,'excluded',true),
  'Se retiró de Javier la partición 2177299 perteneciente a Gastón'
from excluded;

delete from public.ninja_unclaimed_broker_accounts pending
using public.ninja_connectors proposed,public.nodal_users users
where proposed.id=pending.proposed_destination_connector_id
  and users.id=proposed.owner_user_id
  and lower(users.email)=lower('toralesjavierv@gmail.com')
  and upper(btrim(pending.account_name))='2177299';
