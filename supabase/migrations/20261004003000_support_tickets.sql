-- Tickets de ayuda creados por usuarios autenticados y despachados por un
-- puente de correo mediante credenciales temporales de un solo propósito.

create table public.support_tickets (
  id uuid primary key,
  ticket_code text not null unique check (ticket_code ~ '^NOD-[0-9A-F]{8}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  requester_email text not null,
  requester_name text not null,
  category text not null check (category in ('technical', 'operations', 'accounting', 'other')),
  subject text not null check (char_length(subject) between 5 and 120),
  description text not null check (char_length(description) between 20 and 4000),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  dispatch_token_hash text not null check (dispatch_token_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_ticket_email_normalized check (
    requester_email = lower(btrim(requester_email))
    and requester_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  )
);

create index support_tickets_creator_idx on public.support_tickets(created_by, created_at desc);
create trigger support_tickets_set_updated_at before update on public.support_tickets
for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;
create policy support_tickets_read_own on public.support_tickets for select to authenticated
using (created_by = (select auth.uid()));
revoke all on table public.support_tickets from public, anon, authenticated;
grant select on table public.support_tickets to authenticated;

create function public.create_support_ticket(
  target_category text,
  target_subject text,
  target_description text,
  target_token_hash text
)
returns table(ticket_id uuid, ticket_code text)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  actor public.nodal_users%rowtype;
  new_id uuid := extensions.gen_random_uuid();
  new_code text := 'NOD-' || upper(substr(replace(new_id::text, '-', ''), 1, 8));
begin
  select users.* into actor from public.nodal_users users
  where users.id = actor_id and users.access_state = 'active';
  if actor.id is null then raise exception 'Active user required'; end if;
  if target_category not in ('technical', 'operations', 'accounting', 'other')
    or char_length(btrim(target_subject)) not between 5 and 120
    or char_length(btrim(target_description)) not between 20 and 4000
    or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid support ticket';
  end if;
  if (select count(*) from public.support_tickets tickets
      where tickets.created_by = actor_id and tickets.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Support ticket rate limit reached';
  end if;
  insert into public.support_tickets(
    id, ticket_code, created_by, requester_email, requester_name,
    category, subject, description, dispatch_token_hash
  ) values (
    new_id, new_code, actor_id, lower(btrim(actor.email)),
    coalesce(nullif(btrim(actor.display_name), ''), actor.email), target_category,
    btrim(target_subject), btrim(target_description), target_token_hash
  );
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (actor_id, 'support_tickets', new_id, 'support_ticket_created',
    jsonb_build_object('ticket_code', new_code, 'category', target_category),
    'Solicitud de ayuda creada desde NODAL App');
  return query select new_id, new_code;
end;
$$;

create function public.get_support_ticket_dispatch(target_ticket_id uuid, target_token text)
returns table(
  ticket_code text, requester_email text, requester_name text,
  category text, subject text, description text, created_at timestamptz
)
language sql security definer set search_path = '' as $$
  select tickets.ticket_code, tickets.requester_email, tickets.requester_name,
    tickets.category, tickets.subject, tickets.description, tickets.created_at
  from public.support_tickets tickets
  where tickets.id = target_ticket_id and tickets.status = 'pending'
    and tickets.dispatch_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  limit 1;
$$;

create function public.mark_support_ticket_sent(target_ticket_id uuid, target_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare selected_ticket public.support_tickets%rowtype;
begin
  update public.support_tickets tickets set status = 'sent', sent_at = now()
  where tickets.id = target_ticket_id and tickets.status = 'pending'
    and tickets.dispatch_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  returning tickets.* into selected_ticket;
  if selected_ticket.id is null then return false; end if;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (selected_ticket.created_by, 'support_tickets', selected_ticket.id, 'support_ticket_sent',
    jsonb_build_object('ticket_code', selected_ticket.ticket_code),
    'Ticket enviado a contacto@nodaltrading.com');
  return true;
end;
$$;

create function public.fail_support_ticket(target_ticket_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid());
begin
  update public.support_tickets tickets set status = 'failed', failed_at = now()
  where tickets.id = target_ticket_id and tickets.created_by = actor_id and tickets.status = 'pending';
  return found;
end;
$$;

revoke all on function public.create_support_ticket(text,text,text,text) from public, anon;
revoke all on function public.get_support_ticket_dispatch(uuid,text) from public;
revoke all on function public.mark_support_ticket_sent(uuid,text) from public;
revoke all on function public.fail_support_ticket(uuid) from public, anon;
grant execute on function public.create_support_ticket(text,text,text,text) to authenticated;
grant execute on function public.get_support_ticket_dispatch(uuid,text) to anon, authenticated;
grant execute on function public.mark_support_ticket_sent(uuid,text) to anon, authenticated;
grant execute on function public.fail_support_ticket(uuid) to authenticated;
