alter table public.knowledge_documents add column if not exists source_name text;
alter table public.knowledge_documents add column if not exists is_public boolean not null default true;

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
