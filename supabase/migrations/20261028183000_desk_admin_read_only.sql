-- APP-226: branch administrators supervise their structure in read-only mode.
-- Every mutation of access, roles, hierarchy, capabilities and invitations is
-- reserved to Admin Master, including direct RPC calls outside the UI.

alter function public.desk_admin_save_user_v2(
  uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid
) rename to desk_admin_save_user_v2_admin_master_impl;

revoke all on function public.desk_admin_save_user_v2_admin_master_impl(
  uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid
) from public, anon, authenticated;

create function public.desk_admin_save_user_v2(
  target_user_id uuid,
  target_state text,
  target_contact_email text,
  target_identities_enabled boolean,
  target_commission_bps integer,
  target_is_admin boolean,
  target_admin_bps integer,
  target_assigned_user_ids uuid[],
  target_membership_desk_id uuid,
  target_dependency_destination_desk_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  perform public.desk_admin_save_user_v2_admin_master_impl(
    target_user_id,
    target_state,
    target_contact_email,
    target_identities_enabled,
    target_commission_bps,
    target_is_admin,
    target_admin_bps,
    target_assigned_user_ids,
    target_membership_desk_id,
    target_dependency_destination_desk_id
  );
end;
$$;

revoke all on function public.desk_admin_save_user_v2(
  uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid
) from public, anon;
grant execute on function public.desk_admin_save_user_v2(
  uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid
) to authenticated;

-- The superseded v1 mutation is no longer used and must not remain as a
-- bypass for branch administrators.
revoke all on function public.desk_admin_save_user(
  uuid,text,text,boolean,integer,boolean,integer,uuid[]
) from authenticated;

alter function public.create_nodal_user_invitation(text,uuid,text)
  rename to create_nodal_user_invitation_admin_master_impl;
revoke all on function public.create_nodal_user_invitation_admin_master_impl(text,uuid,text)
  from public, anon, authenticated;

create function public.create_nodal_user_invitation(
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
  invitation_id uuid;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  select public.create_nodal_user_invitation_admin_master_impl(
    target_email,
    target_referred_by_user_id,
    target_token_hash
  ) into invitation_id;
  return invitation_id;
end;
$$;

revoke all on function public.create_nodal_user_invitation(text,uuid,text)
  from public, anon;
grant execute on function public.create_nodal_user_invitation(text,uuid,text)
  to authenticated;

alter function public.mark_nodal_user_invitation_sent(uuid)
  rename to mark_nodal_user_invitation_sent_admin_master_impl;
revoke all on function public.mark_nodal_user_invitation_sent_admin_master_impl(uuid)
  from public, anon, authenticated;

create function public.mark_nodal_user_invitation_sent(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed boolean;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  select public.mark_nodal_user_invitation_sent_admin_master_impl(target_invitation_id)
  into changed;
  return changed;
end;
$$;

revoke all on function public.mark_nodal_user_invitation_sent(uuid)
  from public, anon;
grant execute on function public.mark_nodal_user_invitation_sent(uuid)
  to authenticated;

alter function public.fail_nodal_user_invitation(uuid)
  rename to fail_nodal_user_invitation_admin_master_impl;
revoke all on function public.fail_nodal_user_invitation_admin_master_impl(uuid)
  from public, anon, authenticated;

create function public.fail_nodal_user_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed boolean;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  select public.fail_nodal_user_invitation_admin_master_impl(target_invitation_id)
  into changed;
  return changed;
end;
$$;

revoke all on function public.fail_nodal_user_invitation(uuid)
  from public, anon;
grant execute on function public.fail_nodal_user_invitation(uuid)
  to authenticated;

comment on function public.desk_admin_save_user_v2(
  uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid
) is 'Admin Master-only audited mutation. Branch Admin panels are read-only.';
comment on function public.create_nodal_user_invitation(text,uuid,text)
  is 'Creates invitations exclusively for an authenticated Admin Master.';
