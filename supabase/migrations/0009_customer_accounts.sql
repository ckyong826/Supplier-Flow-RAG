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
