-- SupplierFlow Premium schema bundle
-- Copy and run this file once in the Supabase SQL Editor.
-- This file intentionally lives outside supabase/migrations so it is not auto-run twice.

begin;

-- 0009: customer accounts and account links
create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  primary_contact_name text not null,
  primary_email text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'on_hold')),
  assigned_sales_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_accounts enable row level security;

create unique index if not exists customer_accounts_primary_email_idx
  on public.customer_accounts (lower(primary_email));

alter table public.rfqs
  add column if not exists account_id uuid references public.customer_accounts(id) on delete set null;

create index if not exists rfqs_account_id_idx on public.rfqs(account_id);

alter table public.customer_price_overrides
  add column if not exists account_id uuid references public.customer_accounts(id) on delete cascade;

create unique index if not exists customer_price_overrides_account_product_idx
  on public.customer_price_overrides (account_id, product_id)
  where account_id is not null;

-- 0010: staff roles and audit trail
alter table public.profiles drop constraint if exists profiles_role_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('owner', 'admin', 'manager', 'sales', 'operations'));
  end if;
end $$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);
alter table public.audit_logs enable row level security;

-- 0011: CRM tasks
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

-- 0012: inventory ledger
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null check (reason in ('receipt', 'adjustment', 'sale', 'correction')),
  reference text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  rfq_id uuid references public.rfqs(id) on delete set null,
  account_id uuid references public.customer_accounts(id) on delete set null,
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved', 'released', 'fulfilled')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);
create index if not exists inventory_reservations_active_idx on public.inventory_reservations(product_id, status, expires_at);
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;

-- 0013: quotation governance
alter table public.quotations add column if not exists approval_status text not null default 'pending';
alter table public.quotations add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.quotations add column if not exists approved_at timestamptz;
alter table public.quotations add column if not exists rejection_reason text;
alter table public.quotations drop constraint if exists quotations_approval_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quotations_approval_status_check'
      and conrelid = 'public.quotations'::regclass
  ) then
    alter table public.quotations
      add constraint quotations_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

update public.quotations
set approval_status = 'approved', approved_at = coalesce(approved_at, created_at)
where status in ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')
  and approval_status = 'pending';

create unique index if not exists quotations_rfq_revision_idx on public.quotations(rfq_id, revision);

-- 0014: integration delivery history
create table if not exists public.integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  target_url text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_deliveries_status_idx
  on public.integration_deliveries(status, next_attempt_at, created_at desc);
alter table public.integration_deliveries enable row level security;

-- 0015: human-approved AI actions
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

commit;

-- Product availability values used by the official catalogue.
alter table public.products drop constraint if exists products_availability_check;
alter table public.products add constraint products_availability_check
  check (availability in ('In stock', 'Low stock', 'Pre-order', 'Check availability'));

-- Refresh PostgREST's schema cache immediately.
notify pgrst, 'reload schema';
