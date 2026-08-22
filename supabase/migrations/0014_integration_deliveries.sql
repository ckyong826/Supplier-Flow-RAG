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

create index if not exists integration_deliveries_status_idx on public.integration_deliveries(status, next_attempt_at, created_at desc);
alter table public.integration_deliveries enable row level security;
