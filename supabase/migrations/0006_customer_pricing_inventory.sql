alter table public.products
  add column if not exists stock_quantity integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
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
