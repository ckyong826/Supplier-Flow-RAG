alter table public.products drop constraint if exists products_availability_check;
alter table public.products add constraint products_availability_check check (availability in ('In stock', 'Low stock', 'Pre-order', 'Check availability'));
