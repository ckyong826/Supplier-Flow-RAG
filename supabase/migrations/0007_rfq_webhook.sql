alter table public.supplier_settings
  add column if not exists rfq_webhook_url text;
