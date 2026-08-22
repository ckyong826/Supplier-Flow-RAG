alter table public.rfqs
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists rfqs_assigned_to_idx on public.rfqs(assigned_to);
