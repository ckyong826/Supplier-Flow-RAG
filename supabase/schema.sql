-- Run once in Supabase Dashboard > SQL Editor.
-- Public visitors can only access the application through server endpoints.

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  customer_name text not null,
  company_name text not null,
  email text not null,
  requirements text,
  status text not null default 'NEW' check (status in ('NEW', 'REVIEWING', 'QUOTED', 'WON', 'LOST', 'CANCELLED')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'sales' check (role in ('admin', 'sales')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  sku text unique not null,
  category text not null,
  summary text not null,
  specifications jsonb not null default '[]'::jsonb,
  availability text not null default 'In stock' check (availability in ('In stock', 'Low stock', 'Pre-order')),
  image_url text,
  datasheet_path text,
  image_type text not null default 'accessory',
  price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  reference text unique not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
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

create table if not exists public.supplier_settings (
  id boolean primary key default true check (id),
  company_name text not null,
  registration_number text,
  address text,
  email text,
  phone text,
  logo_url text,
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

create or replace function public.match_knowledge_chunks(query_embedding vector(1536), match_count int default 5)
returns table(id uuid, content text, title text, source_type text, similarity float)
language sql stable as $$
  select c.id, c.content, d.title, d.source_type, 1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c join public.knowledge_documents d on d.id = c.document_id
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create index if not exists rfqs_created_at_idx on public.rfqs(created_at desc);
create index if not exists rfq_items_rfq_id_idx on public.rfq_items(rfq_id);
create index if not exists products_category_idx on public.products(category);
create index if not exists quotations_rfq_id_idx on public.quotations(rfq_id);

alter table public.rfqs enable row level security;
alter table public.rfq_items enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.activity_logs enable row level security;
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
