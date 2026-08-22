alter table public.quotations add column if not exists approval_status text not null default 'pending';
alter table public.quotations add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.quotations add column if not exists approved_at timestamptz;
alter table public.quotations add column if not exists rejection_reason text;
alter table public.quotations drop constraint if exists quotations_approval_status_check;
alter table public.quotations add constraint quotations_approval_status_check check (approval_status in ('pending', 'approved', 'rejected'));
update public.quotations set approval_status = 'approved', approved_at = coalesce(approved_at, created_at) where status in ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED') and approval_status = 'pending';
create unique index if not exists quotations_rfq_revision_idx on public.quotations(rfq_id, revision);
