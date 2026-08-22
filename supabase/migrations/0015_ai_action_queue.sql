create table if not exists public.ai_action_runs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null check (action_type in ('create_follow_up_task')),
  rfq_id uuid references public.rfqs(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_action_runs_status_idx on public.ai_action_runs(status, created_at desc);
alter table public.ai_action_runs enable row level security;
