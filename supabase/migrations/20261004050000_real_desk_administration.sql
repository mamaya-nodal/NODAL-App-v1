-- APP-150: flujos reales del panel Admin.
-- Las altas siguen requiriendo aprobacion de Admin Master. Los administradores
-- de mesa solo pueden operar sobre su propia rama y todos los cambios quedan
-- registrados sin reescribir meses anteriores.

alter table public.nodal_users
  add column if not exists contact_email text,
  add column if not exists identities_enabled boolean not null default true;

update public.nodal_users
set contact_email = email
where contact_email is null;

alter table public.nodal_users
  add constraint nodal_users_contact_email_valid check (
    contact_email is null or (
      contact_email = lower(btrim(contact_email))
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  );

create table public.nodal_user_invitations (
  id uuid primary key default gen_random_uuid(),
  desk_id uuid not null references public.nodal_desks(id) on delete restrict,
  recipient_email text not null,
  referred_by_user_id uuid not null references public.nodal_users(id) on delete restrict,
  created_by uuid not null references public.nodal_users(id) on delete restrict,
  status text not null default 'sending' check (
    status in ('sending', 'sent', 'pending_approval', 'approved', 'rejected', 'failed', 'cancelled')
  ),
  invitation_token_hash text not null,
  sent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.nodal_users(id) on delete restrict,
  approved_user_id uuid references public.nodal_users(id) on delete restrict,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nodal_user_invitation_email_valid check (
    recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint nodal_user_invitation_hash_valid check (invitation_token_hash ~ '^[0-9a-f]{64}$')
);

create unique index nodal_user_invitations_one_open_email
on public.nodal_user_invitations(lower(recipient_email))
where status in ('sending', 'sent', 'pending_approval');

create index nodal_user_invitations_desk_status_idx
on public.nodal_user_invitations(desk_id, status, created_at desc);

create trigger nodal_user_invitations_set_updated_at
before update on public.nodal_user_invitations
for each row execute function public.set_updated_at();

create or replace function public.nodal_actor_managed_desk(reference_month date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select terms.desk_id
  from (
    select distinct on (desk_id) desk_id, manager_id, active
    from public.nodal_desk_terms
    where effective_month <= reference_month
    order by desk_id, effective_month desc
  ) terms
  join public.nodal_desks desks on desks.id = terms.desk_id
  where terms.manager_id = (select auth.uid())
    and terms.active
    and desks.parent_id is not null
  order by desks.created_at, desks.id
  limit 1;
$$;

create or replace function public.nodal_actor_managed_desk()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.nodal_actor_managed_desk(public.nodal_accounting_period_month(now()));
$$;

create or replace function public.nodal_actor_can_manage_desk(
  target_desk_id uuid,
  reference_month date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_current_user_admin() or exists (
    with recursive branch(id) as (
      select public.nodal_actor_managed_desk(reference_month)
      union all
      select desks.id
      from public.nodal_desks desks
      join branch on desks.parent_id = branch.id
      join lateral (
        select active
        from public.nodal_desk_terms
        where desk_id = desks.id and effective_month <= reference_month
        order by effective_month desc limit 1
      ) terms on terms.active
    )
    select 1 from branch where id = target_desk_id
  );
$$;

create or replace function public.nodal_actor_can_manage_desk(target_desk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.nodal_actor_can_manage_desk(
    target_desk_id,
    public.nodal_accounting_period_month(now())
  );
$$;

alter table public.nodal_user_invitations enable row level security;
revoke all on table public.nodal_user_invitations from public, anon, authenticated;
grant select on table public.nodal_user_invitations to authenticated;
create policy nodal_user_invitations_scoped_read
on public.nodal_user_invitations for select to authenticated
using (public.nodal_actor_can_manage_desk(desk_id));

create or replace function public.create_nodal_user_invitation(
  target_email text,
  target_referred_by_user_id uuid,
  target_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  managed_desk uuid := public.nodal_actor_managed_desk();
  normalized_email text := lower(btrim(target_email));
  invitation_id uuid;
  referrer_desk uuid;
begin
  if actor_id is null or managed_desk is null then raise exception 'DESK_ADMIN_REQUIRED'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or length(normalized_email) > 254
    or target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITATION'; end if;
  if exists(select 1 from public.nodal_users where email = normalized_email and access_state = 'active') then
    raise exception 'USER_ALREADY_ACTIVE';
  end if;

  select terms.desk_id into referrer_desk
  from public.nodal_user_terms terms
  where terms.user_id = target_referred_by_user_id
    and terms.effective_month <= public.nodal_accounting_period_month(now())
  order by terms.effective_month desc limit 1;
  if target_referred_by_user_id <> actor_id
    and (referrer_desk is null or not public.nodal_actor_can_manage_desk(referrer_desk)) then
    raise exception 'REFERRER_OUTSIDE_BRANCH';
  end if;

  insert into public.nodal_user_invitations(
    desk_id, recipient_email, referred_by_user_id, created_by, invitation_token_hash
  ) values (
    managed_desk, normalized_email, target_referred_by_user_id, actor_id, target_token_hash
  ) returning id into invitation_id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'nodal_user_invitations', invitation_id, 'user_invitation_created',
    jsonb_build_object('desk_id', managed_desk, 'recipient_email', normalized_email,
      'referred_by_user_id', target_referred_by_user_id),
    'Invitacion creada por administrador de mesa');
  return invitation_id;
end;
$$;

create or replace function public.mark_nodal_user_invitation_sent(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nodal_user_invitations
  set status = 'pending_approval', sent_at = coalesce(sent_at, now())
  where id = target_invitation_id and created_by = auth.uid() and status in ('sending', 'sent');
  return found;
end;
$$;

create or replace function public.fail_nodal_user_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nodal_user_invitations set status = 'failed'
  where id = target_invitation_id and created_by = auth.uid() and status = 'sending';
  return found;
end;
$$;

create or replace function public.admin_review_nodal_user_invitation(
  target_invitation_id uuid,
  target_approved boolean,
  target_display_name text,
  target_period_month date,
  target_commission_bps integer,
  management_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation public.nodal_user_invitations%rowtype;
  provisioned record;
begin
  if actor_id is null or not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(management_reason), '') is null then raise exception 'REASON_REQUIRED'; end if;
  select * into invitation from public.nodal_user_invitations
  where id = target_invitation_id and status in ('sent', 'pending_approval') for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_PENDING'; end if;

  if not target_approved then
    update public.nodal_user_invitations set status = 'rejected', reviewed_at = now(),
      reviewed_by = actor_id, rejection_reason = btrim(management_reason)
    where id = invitation.id;
    insert into public.audit_events(actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason)
    values(actor_id, 'nodal_user_invitations', invitation.id, 'user_invitation_rejected',
      to_jsonb(invitation), jsonb_build_object('status', 'rejected'), btrim(management_reason));
    return null;
  end if;

  if target_commission_bps is null or target_commission_bps < 0 or target_commission_bps > 10000 then
    raise exception 'INVALID_COMMISSION';
  end if;
  select * into provisioned
  from public.admin_authorize_and_provision_nodal_user(
    invitation.recipient_email, nullif(btrim(target_display_name), ''),
    target_period_month, btrim(management_reason)
  );

  insert into public.nodal_user_terms(
    user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled
  ) values (
    provisioned.target_user_id, target_period_month, invitation.desk_id, 1, 'active',
    target_commission_bps, false
  ) on conflict(user_id, effective_month) do update set
    desk_id = excluded.desk_id, state = 'active', commission_bps = excluded.commission_bps,
    bonus_enabled = false;

  update public.nodal_users set contact_email = coalesce(contact_email, email)
  where id = provisioned.target_user_id;
  update public.nodal_user_invitations set status = 'approved', reviewed_at = now(),
    reviewed_by = actor_id, approved_user_id = provisioned.target_user_id
  where id = invitation.id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason)
  values(actor_id, 'nodal_user_invitations', invitation.id, 'user_invitation_approved',
    to_jsonb(invitation), jsonb_build_object('status', 'approved',
      'approved_user_id', provisioned.target_user_id, 'commission_bps', target_commission_bps),
    btrim(management_reason));
  return provisioned.target_user_id;
end;
$$;

create or replace function public.desk_admin_save_user(
  target_user_id uuid,
  target_state text,
  target_contact_email text,
  target_identities_enabled boolean,
  target_commission_bps integer,
  target_is_admin boolean,
  target_admin_bps integer,
  target_assigned_user_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  month date := public.nodal_accounting_period_month(now());
  old_terms public.nodal_user_terms%rowtype;
  target_desk uuid;
  managed_desk uuid;
  managed_parent uuid;
  prior_desk_terms public.nodal_desk_terms%rowtype;
  candidate uuid;
  candidate_terms public.nodal_user_terms%rowtype;
  old_user jsonb;
  new_user jsonb;
  normalized_contact text := nullif(lower(btrim(target_contact_email)), '');
  percentages_changed boolean := false;
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if target_user_id = actor_id and not public.is_current_user_admin() then raise exception 'SELF_EDIT_FORBIDDEN'; end if;
  if target_state not in ('active', 'paused', 'inactive') then raise exception 'INVALID_STATE'; end if;
  if target_commission_bps is null or target_commission_bps not between 0 and 10000
    or (target_is_admin and (target_admin_bps is null or target_admin_bps not between 0 and 10000)) then
    raise exception 'INVALID_PERCENTAGE';
  end if;
  if normalized_contact is not null and normalized_contact !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'INVALID_CONTACT_EMAIL';
  end if;
  perform pg_advisory_xact_lock(9080701);

  select * into old_terms from public.nodal_user_terms
  where user_id = target_user_id and effective_month <= month
  order by effective_month desc limit 1;
  if old_terms.user_id is null or not public.nodal_actor_can_manage_desk(old_terms.desk_id) then
    raise exception 'TARGET_OUTSIDE_BRANCH';
  end if;
  target_desk := old_terms.desk_id;

  select terms.* into prior_desk_terms
  from public.nodal_desk_terms terms
  where terms.manager_id = target_user_id and terms.effective_month <= month and terms.active
  order by terms.effective_month desc limit 1;
  managed_desk := prior_desk_terms.desk_id;
  if managed_desk is not null then
    select parent_id into managed_parent from public.nodal_desks where id = managed_desk;
  end if;

  percentages_changed := old_terms.commission_bps is distinct from target_commission_bps
    or (target_is_admin and prior_desk_terms.nodal_bps is distinct from target_admin_bps);
  if percentages_changed and not public.is_current_user_admin()
    and not public.nodal_desk_terms_window_open(now()) then
    raise exception 'PERCENTAGE_WINDOW_CLOSED';
  end if;

  select to_jsonb(users) into old_user from public.nodal_users users where id = target_user_id for update;
  if old_user is null then raise exception 'USER_NOT_FOUND'; end if;
  update public.nodal_users set
    contact_email = normalized_contact,
    identities_enabled = target_identities_enabled,
    access_state = case when target_state = 'inactive' then 'revoked'::public.nodal_access_state else 'active'::public.nodal_access_state end,
    revoked_at = case when target_state = 'inactive' then coalesce(revoked_at, now()) else null end,
    authorized_at = case when target_state <> 'inactive' then coalesce(authorized_at, now()) else authorized_at end
  where id = target_user_id;

  if target_is_admin and managed_desk is null then
    if not public.is_current_user_admin() and not public.nodal_desk_terms_window_open(now()) then
      raise exception 'PERCENTAGE_WINDOW_CLOSED';
    end if;
    insert into public.nodal_desks(name, parent_id)
    select 'Mesa de ' || coalesce(nullif(btrim(display_name), ''), email), target_desk
    from public.nodal_users where id = target_user_id
    returning id into managed_desk;
    managed_parent := target_desk;
  end if;

  if target_is_admin then
    insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
    values(managed_desk, month, target_user_id, target_admin_bps, true)
    on conflict(desk_id, effective_month) do update set
      manager_id = excluded.manager_id, nodal_bps = excluded.nodal_bps, active = true;

    foreach candidate in array coalesce(target_assigned_user_ids, '{}') loop
      if candidate = target_user_id or candidate = actor_id then raise exception 'INVALID_ASSIGNMENT'; end if;
      select * into candidate_terms from public.nodal_user_terms
      where user_id = candidate and effective_month <= month order by effective_month desc limit 1;
      if candidate_terms.user_id is null or not public.nodal_actor_can_manage_desk(candidate_terms.desk_id) then
        raise exception 'ASSIGNEE_OUTSIDE_BRANCH';
      end if;
      if exists(
        select 1 from public.nodal_desk_terms desk_terms
        where desk_terms.manager_id = candidate and desk_terms.effective_month <= month and desk_terms.active
      ) then raise exception 'NESTED_ADMIN_MOVE_FORBIDDEN'; end if;
      insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
      values(candidate, month, managed_desk, candidate_terms.level, candidate_terms.state, candidate_terms.commission_bps, false)
      on conflict(user_id, effective_month) do update set desk_id = excluded.desk_id, bonus_enabled = false;
      insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
      values(candidate, managed_desk, actor_id, month, 'user_reassigned', to_jsonb(candidate_terms),
        jsonb_build_object('desk_id', managed_desk));
    end loop;

    for candidate in
      select terms.user_id from (
        select distinct on(user_id) * from public.nodal_user_terms
        where effective_month <= month order by user_id, effective_month desc
      ) terms
      where terms.desk_id = managed_desk
        and not (terms.user_id = any(coalesce(target_assigned_user_ids, '{}')))
    loop
      if exists(
        select 1 from public.nodal_desk_terms desk_terms
        where desk_terms.manager_id = candidate and desk_terms.effective_month <= month and desk_terms.active
      ) then raise exception 'NESTED_ADMIN_MOVE_FORBIDDEN'; end if;
      select * into candidate_terms from public.nodal_user_terms
      where user_id = candidate and effective_month <= month order by effective_month desc limit 1;
      insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
      values(candidate, month, managed_parent, candidate_terms.level, candidate_terms.state, candidate_terms.commission_bps, false)
      on conflict(user_id, effective_month) do update set desk_id = excluded.desk_id, bonus_enabled = false;
      insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
      values(candidate, managed_parent, actor_id, month, 'user_reassigned', to_jsonb(candidate_terms),
        jsonb_build_object('desk_id', managed_parent));
    end loop;
  elsif managed_desk is not null then
    if exists(
      select 1 from (
        select distinct on(user_id) * from public.nodal_user_terms
        where effective_month <= month order by user_id, effective_month desc
      ) terms where terms.desk_id = managed_desk
    ) or exists(
      select 1 from public.nodal_desks child
      join lateral (select active from public.nodal_desk_terms where desk_id = child.id and effective_month <= month order by effective_month desc limit 1) t on t.active
      where child.parent_id = managed_desk
    ) then raise exception 'REASSIGN_SUBORDINATES_FIRST'; end if;
    insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
    values(managed_desk, month, target_user_id, prior_desk_terms.nodal_bps, false)
    on conflict(desk_id, effective_month) do update set active = false;
  end if;

  insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
  values(target_user_id, month, target_desk, case when target_is_admin then greatest(old_terms.level, 2) else old_terms.level end,
    target_state, target_commission_bps, false)
  on conflict(user_id, effective_month) do update set state = excluded.state,
    commission_bps = excluded.commission_bps, level = excluded.level, bonus_enabled = false;

  select to_jsonb(users) into new_user from public.nodal_users users where id = target_user_id;
  insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
  values(target_user_id, target_desk, actor_id, month, 'desk_admin_user_updated',
    jsonb_build_object('user', old_user, 'terms', to_jsonb(old_terms), 'desk_terms', to_jsonb(prior_desk_terms)),
    jsonb_build_object('user', new_user, 'state', target_state, 'commission_bps', target_commission_bps,
      'is_admin', target_is_admin, 'admin_bps', target_admin_bps,
      'assigned_user_ids', coalesce(to_jsonb(target_assigned_user_ids), '[]'::jsonb)));
end;
$$;

revoke all on function public.nodal_actor_managed_desk(date) from public, anon;
revoke all on function public.nodal_actor_managed_desk() from public, anon;
revoke all on function public.nodal_actor_can_manage_desk(uuid,date) from public, anon;
revoke all on function public.nodal_actor_can_manage_desk(uuid) from public, anon;
revoke all on function public.create_nodal_user_invitation(text,uuid,text) from public, anon;
revoke all on function public.mark_nodal_user_invitation_sent(uuid) from public, anon;
revoke all on function public.fail_nodal_user_invitation(uuid) from public, anon;
revoke all on function public.admin_review_nodal_user_invitation(uuid,boolean,text,date,integer,text) from public, anon;
revoke all on function public.desk_admin_save_user(uuid,text,text,boolean,integer,boolean,integer,uuid[]) from public, anon;
grant execute on function public.nodal_actor_managed_desk(date) to authenticated;
grant execute on function public.nodal_actor_managed_desk() to authenticated;
grant execute on function public.nodal_actor_can_manage_desk(uuid,date) to authenticated;
grant execute on function public.nodal_actor_can_manage_desk(uuid) to authenticated;
grant execute on function public.create_nodal_user_invitation(text,uuid,text) to authenticated;
grant execute on function public.mark_nodal_user_invitation_sent(uuid) to authenticated;
grant execute on function public.fail_nodal_user_invitation(uuid) to authenticated;
grant execute on function public.admin_review_nodal_user_invitation(uuid,boolean,text,date,integer,text) to authenticated;
grant execute on function public.desk_admin_save_user(uuid,text,text,boolean,integer,boolean,integer,uuid[]) to authenticated;

comment on column public.nodal_users.email is
  'Correo de acceso sincronizado con Google. No se modifica desde el panel Admin.';
comment on column public.nodal_users.contact_email is
  'Correo operativo editable. Cambiarlo no altera la cuenta de acceso.';
comment on function public.desk_admin_save_user(uuid,text,text,boolean,integer,boolean,integer,uuid[]) is
  'Persiste cambios del panel Admin con alcance por rama, historial y ventana de 48 horas para porcentajes.';
