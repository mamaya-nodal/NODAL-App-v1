-- The owner may pause an identity's intake without revoking its connector.
-- Existing identities remain enabled. A paused source is never reassigned
-- merely because the Ninja installation can observe other accounts.
create table public.ninja_identity_signal_controls (
  identity_id uuid primary key references public.nodal_identities(id) on delete cascade,
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  is_enabled boolean not null default true,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id) on delete restrict,
  constraint ninja_identity_signal_owner_matches check (owner_user_id = changed_by)
);

create index ninja_identity_signal_controls_owner_idx
  on public.ninja_identity_signal_controls(owner_user_id, identity_id);

alter table public.ninja_identity_signal_controls enable row level security;
revoke all on public.ninja_identity_signal_controls from public, anon, authenticated;
create policy ninja_identity_signal_controls_read_own
  on public.ninja_identity_signal_controls for select to authenticated
  using (owner_user_id = (select auth.uid()) and public.is_current_user_active());
grant select on public.ninja_identity_signal_controls to authenticated;

create function public.set_ninja_identity_signal(target_identity_id uuid, target_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  selected_connector_id uuid;
  previous_enabled boolean;
begin
  if actor_id is null or not public.is_current_user_active() or target_enabled is null then
    raise exception 'Not authorized';
  end if;
  perform 1 from public.nodal_identities identities
  join public.workspaces spaces on spaces.id = identities.workspace_id
  where identities.id = target_identity_id
    and identities.onboarding_status = 'approved'
    and spaces.owner_user_id = actor_id
  for update of identities;
  if not found then raise exception 'Identity is not available'; end if;

  select coalesce(controls.is_enabled, true) into previous_enabled
  from public.ninja_identity_signal_controls controls
  where controls.identity_id = target_identity_id;
  previous_enabled := coalesce(previous_enabled, true);
  if previous_enabled = target_enabled then return target_enabled; end if;

  select connectors.id into selected_connector_id
  from public.ninja_connectors connectors
  where connectors.identity_id = target_identity_id and connectors.status = 'active'
  order by connectors.paired_at desc limit 1;
  if selected_connector_id is not null and exists (
    select 1 from public.ninja_operation_probe_sessions sessions
    where sessions.connector_id = selected_connector_id
      and sessions.status in ('open', 'settling')
      and sessions.excluded_at is null
  ) then raise exception 'Identity has an operation in progress'; end if;

  insert into public.ninja_identity_signal_controls(identity_id, owner_user_id, is_enabled, changed_by)
  values(target_identity_id, actor_id, target_enabled, actor_id)
  on conflict(identity_id) do update set
    is_enabled = excluded.is_enabled, changed_at = now(), changed_by = actor_id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason)
  values(actor_id, 'ninja_identity_signal_controls', target_identity_id,
    'ninja_identity_signal_changed', jsonb_build_object('is_enabled', previous_enabled),
    jsonb_build_object('is_enabled', target_enabled), 'Cambio solicitado desde Identidades');
  return target_enabled;
end;
$$;

revoke all on function public.set_ninja_identity_signal(uuid, boolean) from public, anon;
grant execute on function public.set_ninja_identity_signal(uuid, boolean) to authenticated;
