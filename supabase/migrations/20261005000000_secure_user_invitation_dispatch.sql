-- El servicio de correo solo puede resolver el destinatario con el token
-- efimero generado al crear la invitacion. El email nunca se acepta como
-- autoridad desde el webhook externo.

create or replace function public.get_nodal_user_invitation_dispatch(
  target_invitation_id uuid,
  target_token text
)
returns table(
  recipient_email text,
  referrer_name text
)
language sql
security definer
set search_path = ''
as $$
  select invitations.recipient_email,
    coalesce(nullif(btrim(referrers.display_name), ''), referrers.email)
  from public.nodal_user_invitations invitations
  join public.nodal_users referrers on referrers.id = invitations.referred_by_user_id
  where invitations.id = target_invitation_id
    and invitations.status in ('sending', 'sent', 'pending_approval')
    and invitations.invitation_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  limit 1;
$$;

create or replace function public.mark_nodal_user_invitation_dispatched(
  target_invitation_id uuid,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nodal_user_invitations
  set status = 'pending_approval', sent_at = coalesce(sent_at, now())
  where id = target_invitation_id
    and status in ('sending', 'sent', 'pending_approval')
    and invitation_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex');
  return found;
end;
$$;

revoke all on function public.get_nodal_user_invitation_dispatch(uuid,text) from public;
revoke all on function public.mark_nodal_user_invitation_dispatched(uuid,text) from public;
grant execute on function public.get_nodal_user_invitation_dispatch(uuid,text) to anon, authenticated;
grant execute on function public.mark_nodal_user_invitation_dispatched(uuid,text) to anon, authenticated;

comment on function public.get_nodal_user_invitation_dispatch(uuid,text) is
  'Resuelve en forma segura el destinatario y referente de una invitacion NODAL mediante token efimero.';
comment on function public.mark_nodal_user_invitation_dispatched(uuid,text) is
  'Confirma mediante token efimero que el correo de invitacion fue despachado y lo deja pendiente de Admin Master.';
