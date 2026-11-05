-- El correo de entrega no identifica a la persona ni a la identidad. Es un
-- destino logístico para conectores y complementos, por lo que puede repetirse
-- entre identidades del mismo titular.

drop index if exists public.nodal_identities_workspace_email_unique;

create function public.update_nodal_identity_delivery_email(
  target_identity_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_identity public.nodal_identities%rowtype;
  normalized_email text := lower(btrim(target_email));
begin
  select identities.* into selected_identity
  from public.nodal_identities identities
  where identities.id = target_identity_id
    and public.can_access_workspace(identities.workspace_id)
  for update;

  if actor_id is null or selected_identity.id is null then
    raise exception 'Unauthorized identity';
  end if;
  if normalized_email is null
    or length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid delivery email';
  end if;

  update public.nodal_identities set
    contact_email = normalized_email,
    updated_by = actor_id
  where id = selected_identity.id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id,
    'nodal_identities',
    selected_identity.id,
    'identity_delivery_email_updated',
    jsonb_build_object('contact_email', selected_identity.contact_email),
    jsonb_build_object('contact_email', normalized_email),
    'Actualización del correo de entrega de conectores y complementos'
  );
end;
$$;

revoke all on function public.update_nodal_identity_delivery_email(uuid,text) from public, anon;
grant execute on function public.update_nodal_identity_delivery_email(uuid,text) to authenticated;

comment on column public.nodal_identities.contact_email is
'Correo de entrega de conectores y complementos. Puede repetirse entre identidades del mismo titular.';
