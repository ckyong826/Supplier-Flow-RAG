// Knowledge retrieval for SupplyAI.
//
// Three modes, selected by RETRIEVAL_MODE:
//   keyword  term-overlap + reciprocal rank fusion (the original behaviour, and the default)
//   vector   OpenAI query embedding + pgvector cosine search via match_knowledge_chunks
//   hybrid   both, fused by reciprocal rank
//
// Vector mode degrades to keyword on any failure (missing key, API error, empty result) so a
// retrieval problem can never take the chat endpoint down. Every call reports which mode
// actually served it, so a silent permanent fallback is visible rather than invisible.

import { documentSummary, fuseByKeywords, fuseByKeywordsWithCoverage, rerankByCoverage } from "./retrieval.mjs";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// Cosine similarity below this is treated as "no supporting document". Without a floor the
// RPC always returns match_count rows, so an unanswerable question still arrives at the model
// wrapped in authoritative-looking context.
export const DEFAULT_MIN_SIMILARITY = 0.35;

export function retrievalMode() {
  const mode = (process.env.RETRIEVAL_MODE || "keyword").toLowerCase();
  return ["keyword", "vector", "hybrid", "multi"].includes(mode) ? mode : "keyword";
}

export async function embedQuery(text, { apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
  });
  if (!response.ok) throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error("Embedding response had no vector");
  // A dimension mismatch inserts cleanly and then silently returns nonsense, so check it here.
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding has ${vector.length} dimensions, schema expects ${EMBEDDING_DIMENSIONS}`);
  }
  return vector;
}

// Normalises both retrievers onto one shape: { content, title, source_type, similarity }.
function fromChunkRow(row) {
  return {
    content: row.content,
    title: row.knowledge_documents?.title ?? row.title ?? "",
    source_type: row.knowledge_documents?.source_type ?? row.source_type ?? "",
    similarity: typeof row.similarity === "number" ? row.similarity : null
  };
}

export async function keywordSearch({ supabase, queries, limit = 3, poolSize = 200 }) {
  const rows = await publicChunkRows({ supabase, poolSize });
  return fuseByKeywordsWithCoverage(rows, queries, (row) => row.content, limit).map(fromChunkRow);
}

async function publicChunkRows({ supabase, poolSize = 200 }) {
  // No ordering on this fetch: past poolSize chunks PostgREST truncates arbitrarily and
  // documents drop out of retrieval with no error. Ordering by document keeps it deterministic.
  const rows = await (await supabase(
    `knowledge_chunks?select=document_id,content,chunk_index,knowledge_documents!inner(title,source_type,is_public)&knowledge_documents.is_public=eq.true&order=document_id,chunk_index&limit=${poolSize}`
  )).json();
  if (rows.length >= poolSize) {
    console.warn(`[retrieval] keyword pool hit its ${poolSize}-row cap; some chunks are unreachable. Switch to vector mode or raise the cap.`);
  }
  return rows;
}

export async function multiRepresentationSearch({ supabase, queries, limit = 3, poolSize = 200 }) {
  const documents = await (await supabase(
    `knowledge_documents?select=id,title,source_type,content&is_public=eq.true&order=id&limit=${Math.ceil(poolSize / 2)}`
  )).json();
  const representations = documents.map((document) => ({
    id: document.id,
    title: document.title,
    summary: documentSummary(document.content),
  }));
  const selectedDocuments = fuseByKeywordsWithCoverage(
    representations,
    queries,
    (document) => document.summary,
    Math.max(limit, queries.length),
  );
  const selectedIds = new Set(selectedDocuments.map((document) => document.id));
  const rows = await publicChunkRows({ supabase, poolSize });
  const chunkCandidates = fuseByKeywordsWithCoverage(rows, queries, (row) => row.content, limit);
  const summaryCandidates = fuseByKeywordsWithCoverage(
    rows.filter((row) => selectedIds.has(row.document_id)),
    queries,
    (row) => row.content,
    limit,
  );
  return fuseByKeywordsWithCoverage(
    [...summaryCandidates, ...chunkCandidates],
    queries,
    (row) => row.content,
    limit,
  ).map(fromChunkRow);
}

export async function vectorSearch({ supabase, question, limit = 3, minSimilarity = DEFAULT_MIN_SIMILARITY, embed = embedQuery }) {
  const queryEmbedding = await embed(question);
  const rows = await (await supabase("rpc/match_knowledge_chunks", {
    method: "POST",
      body: JSON.stringify({ query_embedding: queryEmbedding, match_count: limit, min_similarity: minSimilarity, public_only: true })
  })).json();
  return rows.map(fromChunkRow);
}

// Reciprocal rank fusion across the two rankings. Chunks both retrievers agree on rise to the
// top; either one alone can still surface a chunk the other missed.
function fuseRankings(rankings, limit) {
  const scores = new Map();
  const byKey = new Map();
  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const key = item.content;
      byKey.set(key, item);
      scores.set(key, (scores.get(key) || 0) + 1 / (61 + index));
    });
  }
  return [...scores.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit)
    .map(([key]) => byKey.get(key));
}

export async function retrieveKnowledge({
  supabase,
  question,
  queries,
  limit = 3,
  mode = retrievalMode(),
  minSimilarity = DEFAULT_MIN_SIMILARITY,
  embed = embedQuery,
  reranker = process.env.RETRIEVAL_RERANKER || "lexical"
}) {
  const rerankMode = String(reranker).toLowerCase();
  const candidateLimit = rerankMode === "lexical" || rerankMode === "coverage"
    ? Math.max(limit * 4, 20)
    : limit;
  const finish = (result) => {
    const candidates = result.chunks || [];
    const chunks = rerankMode === "lexical" || rerankMode === "coverage"
      ? rerankByCoverage(candidates, [question, ...queries], (chunk) => chunk.content, limit)
      : candidates.slice(0, limit);
    return { ...result, chunks, rerankMode: rerankMode || null, candidateCount: candidates.length };
  };
  if (mode === "keyword") {
    return finish({ mode: "keyword", chunks: await keywordSearch({ supabase, queries, limit: candidateLimit }) });
  }
  if (mode === "multi") {
    return finish({ mode: "multi", representation: "document-summary", chunks: await multiRepresentationSearch({ supabase, queries, limit: candidateLimit }) });
  }

  let vectorChunks = null;
  let degradedReason = null;
  try {
    vectorChunks = await vectorSearch({ supabase, question, limit: candidateLimit, minSimilarity, embed });
  } catch (error) {
    degradedReason = error instanceof Error ? error.message : String(error);
    console.warn(`[retrieval] vector search failed, falling back to keyword: ${degradedReason}`);
  }

  if (vectorChunks === null) {
    return finish({ mode: "keyword", requestedMode: mode, degradedReason, chunks: await keywordSearch({ supabase, queries, limit: candidateLimit }) });
  }

  if (mode === "vector") {
    // An empty result is a real answer: nothing in the corpus cleared the similarity floor.
    // Do NOT fall back to keyword here - that would reintroduce the weak context the floor
    // exists to suppress, and is the difference between abstaining and fabricating.
    return finish({ mode: "vector", chunks: vectorChunks });
  }

  // Gated hybrid. Vector acts as the gate, keyword as the recall booster.
  //
  // If nothing cleared the similarity floor, treat the question as unsupported and return
  // nothing - do NOT merge in keyword results. Keyword overlap is never exactly zero, so an
  // ungated hybrid can never abstain, and would hand the model authoritative-looking context
  // for questions the corpus cannot answer. That is the SST-rate / credit-limit failure mode.
  //
  // When the gate opens, fuse both rankings: each retriever surfaces chunks the other misses,
  // which is what recovers the multi-document questions.
  if (!vectorChunks.length) {
    return finish({ mode: "hybrid", gated: true, chunks: [] });
  }

  const keywordChunks = await keywordSearch({ supabase, queries, limit: Math.max(candidateLimit, queries.length) });
  const fused = fuseRankings([vectorChunks, keywordChunks], candidateLimit);
  const pinned = keywordChunks.slice(0, Math.max(0, queries.length - 1));
  const selected = [];
  const seen = new Set();
  [...pinned, ...fused].forEach((chunk) => {
    if (!chunk || seen.has(chunk.content)) return;
    seen.add(chunk.content);
    selected.push(chunk);
  });
  return finish({ mode: "hybrid", chunks: selected.slice(0, candidateLimit) });
}

export function formatKnowledge(chunks) {
  return chunks.map((chunk) => `${chunk.title}: ${chunk.content}`).join("\n\n");
}
