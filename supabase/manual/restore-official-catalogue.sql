-- Run once if the Premium schema bundle was already applied.
-- The application seeder then restores the official products by SKU.

alter table public.products drop constraint if exists products_availability_check;
alter table public.products add constraint products_availability_check
  check (availability in ('In stock', 'Low stock', 'Pre-order', 'Check availability'));

notify pgrst, 'reload schema';
