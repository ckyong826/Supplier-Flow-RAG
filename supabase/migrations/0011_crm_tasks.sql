create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid references public.rfqs(id) on delete cascade,
  account_id uuid references public.customer_accounts(id) on delete cascade,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  task_type text not null default 'follow_up' check (task_type in ('call', 'email', 'follow_up', 'internal')),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_due_idx on public.crm_tasks(status, due_at);
create index if not exists crm_tasks_rfq_idx on public.crm_tasks(rfq_id, created_at desc);
alter table public.crm_tasks enable row level security;
