alter table public.chat_sessions add column if not exists owner_token text;

update public.chat_sessions
set owner_token = encode(gen_random_bytes(32), 'hex')
where owner_token is null;

alter table public.chat_sessions alter column owner_token set not null;

create index if not exists chat_sessions_owner_idx
  on public.chat_sessions(owner_token, updated_at desc);
