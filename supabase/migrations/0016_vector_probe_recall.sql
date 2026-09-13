-- Improve vector recall after the corpus grows beyond the original tiny dataset.
-- The index has 10 lists; the default ivfflat.probes=1 searches only one list, which can
-- return fewer than match_count rows and miss an exact supporting chunk.

alter function public.match_knowledge_chunks(vector(1536), integer, double precision, boolean)
  set ivfflat.probes = 10;
