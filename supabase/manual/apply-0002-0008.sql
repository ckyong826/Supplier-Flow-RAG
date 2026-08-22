-- SupplierFlow manual repair script.
-- Run this once in Supabase SQL Editor when the base schema already exists.
-- Safe to re-run: this includes migrations 0002 through 0008 and is idempotent.

begin;

create extension if not exists pgcrypto;
create extension if not exists vector;

-- 0002: vector retrieval floor and index
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  min_similarity float default 0.0
)
returns table(id uuid, content text, title text, source_type text, similarity float)
language sql stable as $$
  select c.id, c.content, d.title, d.source_type, 1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.knowledge_embedding_coverage()
returns table(title text, total bigint, embedded bigint)
language sql stable as $$
  select d.title,
         count(c.id) as total,
         count(c.embedding) as embedded
  from public.knowledge_documents d
  left join public.knowledge_chunks c on c.document_id = d.id
  group by d.title
  order by d.title;
$$;

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

-- 0003: private chat session ownership
alter table public.chat_sessions
  add column if not exists owner_token text;

update public.chat_sessions
set owner_token = encode(gen_random_bytes(32), 'hex')
where owner_token is null;

alter table public.chat_sessions
  alter column owner_token set not null;

create index if not exists chat_sessions_owner_idx
  on public.chat_sessions(owner_token, updated_at desc);

-- 0004: public/internal knowledge sources and final retrieval function
alter table public.knowledge_documents
  add column if not exists source_name text;

alter table public.knowledge_documents
  add column if not exists is_public boolean not null default true;

update public.knowledge_documents
set is_public = false
where source_type = 'sop';

drop function if exists public.match_knowledge_chunks(vector(1536), integer);
drop function if exists public.match_knowledge_chunks(vector(1536), integer, double precision);

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  min_similarity float default 0.35,
  public_only boolean default true
)
returns table(id uuid, content text, title text, source_type text, similarity float)
language sql stable as $$
  select c.id, c.content, d.title, d.source_type, 1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.embedding is not null
    and (not public_only or d.is_public)
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 0005: RFQ assignment
alter table public.rfqs
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists rfqs_assigned_to_idx on public.rfqs(assigned_to);

-- 0006: inventory and customer-specific pricing
alter table public.products
  add column if not exists stock_quantity integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_stock_quantity_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_check
      check (stock_quantity is null or stock_quantity >= 0);
  end if;
end $$;

create table if not exists public.customer_price_overrides (
  id uuid primary key default gen_random_uuid(),
  customer_email text not null,
  product_id text not null references public.products(id) on delete cascade,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_price_overrides_email_product_idx
  on public.customer_price_overrides (lower(customer_email), product_id);

-- 0007: outbound RFQ webhook
alter table public.supplier_settings
  add column if not exists rfq_webhook_url text;

-- 0008: RFQ follow-up reminder date
alter table public.rfqs
  add column if not exists follow_up_date date;

commit;
