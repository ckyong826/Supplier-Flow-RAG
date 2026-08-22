-- Vector retrieval support for the knowledge base.
--
-- Two changes:
--   1. match_knowledge_chunks gains a min_similarity floor. The original always returned
--      match_count rows ordered by distance, so a question with no answer in the corpus still
--      received the N least-bad chunks - which is exactly the situation that produces
--      confident fabrication. With a floor it can return zero rows, and the caller can tell
--      the model there is no supporting document.
--   2. An ivfflat index on the embedding column for cosine distance.

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  min_similarity float default 0.0
)
returns table(id uuid, content text, title text, source_type text, similarity float)
language sql stable as $$
  select c.id, c.content, d.title, d.source_type, 1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Reports embedding coverage so a half-backfilled corpus is visible rather than silently
-- degrading retrieval. A chunk with a null embedding is invisible to vector search.
create or replace function public.knowledge_embedding_coverage()
returns table(title text, total bigint, embedded bigint)
language sql stable as $$
  select d.title,
         count(c.id) as total,
         count(c.embedding) as embedded
  from public.knowledge_documents d
  left join public.knowledge_chunks c on c.document_id = d.id
  group by d.title
  order by d.title;
$$;

-- ivfflat needs lists tuned to corpus size; at this scale the planner will often prefer a
-- sequential scan anyway, which is correct. Raise lists as the corpus grows.
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);
