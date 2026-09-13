-- Run once in Supabase Dashboard > SQL Editor.
-- Public visitors can only access the application through server endpoints.

create extension if not exists pgcrypto;
create extension if not exists vector;

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

create unique index if not exists customer_accounts_primary_email_idx
  on public.customer_accounts (lower(primary_email));

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  customer_name text not null,
  company_name text not null,
  email text not null,
  requirements text,
  status text not null default 'NEW' check (status in ('NEW', 'REVIEWING', 'QUOTED', 'WON', 'LOST', 'CANCELLED')),
  account_id uuid references public.customer_accounts(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  follow_up_date date,
  created_at timestamptz not null default now()
);

create index if not exists rfqs_assigned_to_idx on public.rfqs(assigned_to);
create index if not exists rfqs_account_id_idx on public.rfqs(account_id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'sales' check (role in ('owner', 'admin', 'manager', 'sales', 'operations')),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  sku text unique not null,
  category text not null,
  summary text not null,
  specifications jsonb not null default '[]'::jsonb,
  availability text not null default 'Check availability' check (availability in ('In stock', 'Low stock', 'Pre-order', 'Check availability')),
  image_url text,
  datasheet_path text,
  image_type text not null default 'accessory',
  price numeric(12,2) not null default 0,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_price_overrides (
  id uuid primary key default gen_random_uuid(),
  customer_email text not null,
  account_id uuid references public.customer_accounts(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_price_overrides_email_product_idx
  on public.customer_price_overrides (lower(customer_email), product_id);

create unique index if not exists customer_price_overrides_account_product_idx
  on public.customer_price_overrides (account_id, product_id)
  where account_id is not null;

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  reference text unique not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  discount_percent numeric(5,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  validity_days integer not null default 14,
  payment_terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  requested_product_id text,
  product_id text,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  is_alternative boolean not null default false
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid references public.rfqs(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.supplier_settings (
  id boolean primary key default true check (id),
  company_name text not null,
  registration_number text,
  address text,
  email text,
  phone text,
  logo_url text,
  rfq_webhook_url text,
  quotation_validity_days integer not null default 14,
  payment_terms text,
  sst_percent numeric(5,2) not null default 6,
  updated_at timestamptz not null default now()
);

create table if not exists public.rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null default 'policy' check (source_type in ('datasheet', 'policy', 'faq', 'sop')),
  source_name text,
  is_public boolean not null default true,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_token text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_document_idx on public.knowledge_chunks(document_id);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at);
create index if not exists chat_sessions_owner_idx on public.chat_sessions(owner_token, updated_at desc);

create or replace function public.match_knowledge_chunks(query_embedding vector(1536), match_count int default 5, min_similarity float default 0.35, public_only boolean default true)
returns table(id uuid, content text, title text, source_type text, similarity float)
language sql stable
set ivfflat.probes = 10
as $$
  select c.id, c.content, d.title, d.source_type, 1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c join public.knowledge_documents d on d.id = c.document_id
  where c.embedding is not null
    and (not public_only or d.is_public)
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create index if not exists rfqs_created_at_idx on public.rfqs(created_at desc);
create index if not exists rfq_items_rfq_id_idx on public.rfq_items(rfq_id);
create index if not exists products_category_idx on public.products(category);
create index if not exists quotations_rfq_id_idx on public.quotations(rfq_id);
create unique index if not exists quotations_rfq_revision_idx on public.quotations(rfq_id, revision);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists crm_tasks_due_idx on public.crm_tasks(status, due_at);
create index if not exists crm_tasks_rfq_idx on public.crm_tasks(rfq_id, created_at desc);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);
create index if not exists inventory_reservations_active_idx on public.inventory_reservations(product_id, status, expires_at);
create index if not exists integration_deliveries_status_idx on public.integration_deliveries(status, next_attempt_at, created_at desc);
create index if not exists ai_action_runs_status_idx on public.ai_action_runs(status, created_at desc);

alter table public.rfqs enable row level security;
alter table public.rfq_items enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.products enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.activity_logs enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.integration_deliveries enable row level security;
alter table public.ai_action_runs enable row level security;
alter table public.supplier_settings enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('documents', 'documents', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

update storage.buckets set public = true where id = 'documents';

-- No anonymous table policies. The server uses the service-role key and the
-- browser never receives that key.

-- Then create one Supabase Auth user in Authentication > Users and make it admin:
-- insert into public.profiles (user_id, role) values ('AUTH_USER_UUID', 'admin');

alter table public.products add column if not exists datasheet_path text;
alter table public.supplier_settings add column if not exists logo_url text;
