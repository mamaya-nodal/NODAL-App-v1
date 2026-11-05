create table if not exists public.nodal_agent_cases (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.nodal_users(id) on delete cascade,
  subject_user_id uuid not null references public.nodal_users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  category text not null,
  title text not null,
  description text not null,
  evidence jsonb not null default '[]'::jsonb,
  source_question text,
  source_answer text,
  resolution_note text,
  reviewed_by uuid references public.nodal_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nodal_agent_cases_status_created_idx on public.nodal_agent_cases(status, created_at desc);
create index if not exists nodal_agent_cases_subject_created_idx on public.nodal_agent_cases(subject_user_id, created_at desc);

alter table public.nodal_agent_cases enable row level security;
revoke all on public.nodal_agent_cases from public, anon;

comment on table public.nodal_agent_cases is 'Casos estructurados reportados por Nodalito para revisión de Admin Master.';
