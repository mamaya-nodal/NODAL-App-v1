-- Diagnósticos de IA: lectura propia, escritura transaccional y sin cambios económicos.
create table public.ai_diagnostics (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  alert_code text not null,
  context_fingerprint text not null,
  question text not null,
  answer jsonb not null,
  final_model text not null,
  escalated boolean not null default false,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (period_id, context_fingerprint),
  constraint ai_diagnostics_fingerprint_shape check (context_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ai_diagnostics_question_present check (btrim(question) <> ''),
  constraint ai_diagnostics_tokens_nonnegative check (input_tokens >= 0 and output_tokens >= 0)
);

create index ai_diagnostics_period_created_idx on public.ai_diagnostics(period_id, created_at desc);
alter table public.ai_diagnostics enable row level security;
create policy ai_diagnostics_read_own on public.ai_diagnostics for select to authenticated using (public.can_access_period(period_id));
revoke all on table public.ai_diagnostics from anon;
revoke insert, update, delete on table public.ai_diagnostics from authenticated;
grant select on table public.ai_diagnostics to authenticated;

create function public.save_nodal_ai_diagnostic(
  target_period_id uuid, target_alert_code text, target_context_fingerprint text,
  target_question text, target_answer jsonb, target_final_model text,
  target_escalated boolean, target_input_tokens integer, target_output_tokens integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare diagnostic_id uuid;
begin
  if not public.can_access_period(target_period_id) then raise exception 'period access denied'; end if;
  insert into public.ai_diagnostics(period_id,alert_code,context_fingerprint,question,answer,final_model,escalated,input_tokens,output_tokens,created_by)
  values(target_period_id,target_alert_code,target_context_fingerprint,target_question,target_answer,target_final_model,target_escalated,target_input_tokens,target_output_tokens,(select auth.uid()))
  on conflict(period_id,context_fingerprint) do update set answer=excluded.answer
  returning id into diagnostic_id;
  return diagnostic_id;
end;
$$;
revoke all on function public.save_nodal_ai_diagnostic(uuid,text,text,text,jsonb,text,boolean,integer,integer) from public,anon;
grant execute on function public.save_nodal_ai_diagnostic(uuid,text,text,text,jsonb,text,boolean,integer,integer) to authenticated;
