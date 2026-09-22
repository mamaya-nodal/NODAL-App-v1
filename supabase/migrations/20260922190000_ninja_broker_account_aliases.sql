create table if not exists public.ninja_broker_account_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  connection_name text not null,
  account_name text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  unique(owner_user_id, connection_name, account_name),
  constraint ninja_broker_account_alias_connection_present check (length(btrim(connection_name)) between 1 and 160),
  constraint ninja_broker_account_alias_account_present check (length(btrim(account_name)) between 1 and 160),
  constraint ninja_broker_account_alias_name_present check (length(btrim(display_name)) between 1 and 80)
);

create index if not exists ninja_broker_account_aliases_owner_idx
on public.ninja_broker_account_aliases(owner_user_id, connection_name, account_name);

alter table public.ninja_broker_account_aliases enable row level security;
revoke all on table public.ninja_broker_account_aliases from public, anon, authenticated;

drop policy if exists ninja_broker_account_aliases_select_own on public.ninja_broker_account_aliases;
create policy ninja_broker_account_aliases_select_own
on public.ninja_broker_account_aliases
for select to authenticated
using (owner_user_id = (select auth.uid()));

grant select on table public.ninja_broker_account_aliases to authenticated;

create or replace function public.rename_ninja_broker_account(
  target_connection_name text,
  target_account_name text,
  target_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  active_connector_id uuid;
  alias_id uuid;
  previous_data jsonb;
  normalized_connection text := btrim(target_connection_name);
  normalized_account text := btrim(target_account_name);
  normalized_display text := btrim(target_display_name);
begin
  if actor_id is null or not public.is_current_user_active() then
    raise exception 'Not authorized';
  end if;
  if length(normalized_connection) not between 1 and 160
    or length(normalized_account) not between 1 and 160
    or length(normalized_display) not between 1 and 80 then
    raise exception 'Invalid broker account name';
  end if;

  select connectors.id into active_connector_id
  from public.ninja_connectors connectors
  where connectors.owner_user_id = actor_id
    and connectors.status = 'active'
  order by connectors.paired_at desc
  limit 1;

  if active_connector_id is null or not exists (
    select 1
    from public.ninja_inventory_snapshots snapshots,
         jsonb_array_elements(snapshots.accounts) account
    where snapshots.connector_id = active_connector_id
      and account->>'connectionName' = normalized_connection
      and account->>'accountName' = normalized_account
      and not exists (
        select 1
        from public.ninja_connector_connection_reviews reviews
        where reviews.connector_id = active_connector_id
          and reviews.connection_name = normalized_connection
          and reviews.status = 'isolated'
      )
  ) then
    raise exception 'Broker account was not observed for this user';
  end if;

  select to_jsonb(aliases) into previous_data
  from public.ninja_broker_account_aliases aliases
  where aliases.owner_user_id = actor_id
    and aliases.connection_name = normalized_connection
    and aliases.account_name = normalized_account;

  insert into public.ninja_broker_account_aliases(
    owner_user_id, connection_name, account_name, display_name, created_by, updated_by
  ) values (
    actor_id, normalized_connection, normalized_account, normalized_display, actor_id, actor_id
  )
  on conflict(owner_user_id, connection_name, account_name) do update set
    display_name = excluded.display_name,
    updated_at = now(),
    updated_by = actor_id
  returning id into alias_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'ninja_broker_account_aliases', alias_id, 'ninja_broker_account_renamed',
    previous_data,
    jsonb_build_object(
      'connection_name', normalized_connection,
      'account_name', normalized_account,
      'display_name', normalized_display
    ),
    'Nombre visible asignado por el usuario; la identidad tecnica de la cuenta no cambia'
  );

  return alias_id;
end;
$$;

revoke all on function public.rename_ninja_broker_account(text, text, text) from public, anon;
grant execute on function public.rename_ninja_broker_account(text, text, text) to authenticated;
