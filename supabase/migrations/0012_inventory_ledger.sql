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
