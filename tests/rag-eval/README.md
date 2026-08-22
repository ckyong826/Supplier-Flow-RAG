# SupplierFlow RAG correctness eval

50 questions over the six knowledge-base documents in `data/`, with runners for offline
retrieval, live end-to-end answers, and a keyword-vs-vector A/B.

## What retrieval actually runs

Worth being precise, because the name oversells it. Until the vector path was wired, this was
**not** semantic RAG. `supabase/schema.sql` had pgvector, a `vector(1536)` column and a
`match_knowledge_chunks` RPC — but the RPC was never called from anywhere in the codebase, and
with no `OPENAI_API_KEY` set the ingest wrote `embedding: null` for every chunk. What ran was
lexical: fetch 200 rows, rank in JavaScript by term overlap with reciprocal rank fusion.

Retrieval is now selected by `RETRIEVAL_MODE`:

| Mode | Behaviour |
| --- | --- |
| `keyword` (default) | Term overlap + RRF. The original behaviour. |
| `vector` | OpenAI query embedding → pgvector cosine via `match_knowledge_chunks`, with a similarity floor. |
| `hybrid` | Both, fused by reciprocal rank. |

Vector mode falls back to keyword if embedding fails, but **not** when it legitimately returns
zero rows — that empty result is the signal that nothing cleared the similarity floor, and
preserving it is what lets the model abstain instead of fabricate.

## Files

| File | Purpose |
| --- | --- |
| `rag-eval-questions.json` | The 50-question fixture: 30 direct lookups, 10 adversarial, 10 negatives |
| `match.mjs` | Shared matcher — token-boundary aware, so `type A` can't match inside `type AC` |
| `verify-groundtruth.mjs` | Checks the fixture itself against `data/` before it grades anything |
| `run-retrieval-eval.mjs` | Offline keyword retrieval scoring (Recall@1, Recall@k, MRR) |
| `run-ab-retrieval.mjs` | Keyword vs vector vs hybrid against the real Supabase corpus |
| `run-live-eval.mjs` | Live end-to-end scoring against a running app |
| `grader.test.mjs` | Tests the grader, so it can't silently pass everything |
| `retrieval-modes.test.mjs` | Tests mode switching, fallback and fusion with stubbed I/O |

Related, outside this directory:

| File | Purpose |
| --- | --- |
| `app/api/ai-chat/knowledge-retrieval.mjs` | The shared retrieval module used by both the app and the A/B harness |
| `scripts/backfill-embeddings.mjs` | Embeds chunks inserted before `OPENAI_API_KEY` existed |
| `supabase/migrations/0002_vector_retrieval.sql` | Similarity floor, coverage function, ivfflat index |

## Question design

**30 direct lookups** — 20 product specs, 10 policy facts. One clear source chunk each.

**10 adversarial** — the cases that actually break RAG:

- near-duplicate SKUs: `F202A-40/0.03` vs `F202AC-40/0.03` (one letter apart, both 40 A / 30 mA),
  `F202AC-40/0.3` vs `F202AC-40/0.03` (0.3 vs 0.03), `LC1D09BNE` vs `LC1D09BD` (coil only)
- constraint filtering: "which contactor gives 30 kW at 400 V" when three cards state a kW figure
- aggregation across chunks: all 63 A ABB RCCBs and their residual currents
- multi-hop across documents: order cut-off + regional lead time; product + payment + delivery
- lexical mismatch: "out of stock" when the SOP says "unavailable"

**10 negatives** — the answer is not in the KB and the system must abstain. Chosen so that a
relevant-looking document *will* be retrieved, which is exactly when models fabricate:

| ID | Trap |
| --- | --- |
| N01 | Price — no pricing anywhere in the KB |
| N02 | Stock quantity — system prompt also forbids confirming stock |
| N03 | IP rating of a product whose card exists but omits it |
| N04 | Warranty on Schneider MCBs — warranty doc *will* retrieve and contains 3-year / 2-year figures for LED products |
| N05 | Delivery to Singapore — policy covers Malaysia only |
| N06 | `A9F73150` — fabricated SKU one digit from a real one |
| N07 | Operating temperature — likely recalled from pretraining, not context |
| N08 | Restocking fee — no returns policy exists |
| N09 | Credit limit amount — the phrase "credit limit" appears verbatim with no value |
| N10 | SST rate — "SST" appears verbatim in the SOP with no percentage |

N09 and N10 are the highest-risk cases in the set: the exact phrase is in the retrieved context
with the number missing, which is the strongest possible invitation to invent one.

## Grading

- `expected_keywords` — all must appear. `|` separates acceptable phrasings (`photograph|photos`).
  Matching is token-boundary aware: `type A` does not match inside `type AC`, `40` does not match
  inside `400`, `30 mA` does not match inside `300 mA`.
- `must_not_contain` / `must_not_match` — any hit fails the question outright.
- Negatives pass only when no fabricated value appears **and** the answer signals uncertainty.

## Running

```bash
# 1. Validate the fixture against the source documents (always do this after editing questions)
node tests/rag-eval/verify-groundtruth.mjs

# 2. Test the grader itself
node --test tests/rag-eval/grader.test.mjs

# 3. Offline retrieval pass — no server, no API keys
node tests/rag-eval/run-retrieval-eval.mjs --json tests/rag-eval/results-retrieval.json
node tests/rag-eval/run-retrieval-eval.mjs --k 1     # sensitivity check

# 4. Live end-to-end pass
npm run dev
node tests/rag-eval/run-live-eval.mjs --json tests/rag-eval/results-live.json
node tests/rag-eval/run-live-eval.mjs --only N01,N09,N10   # just the hallucination traps
```

## Setup: get the documents into the database

**The files in `data/` are just files on disk.** The chat endpoint reads from the
`knowledge_documents` / `knowledge_chunks` tables, so until they are imported the bot has no
support knowledge at all and every policy question fails — not because retrieval is bad, but
because the corpus is empty.

```bash
# 1. Apply the migration (similarity floor + coverage function + index)
psql "$DATABASE_URL" -f supabase/migrations/0002_vector_retrieval.sql
#    or paste it into the Supabase SQL editor

# 2. Import the knowledge base. Chunks and embeds in one pass.
node scripts/import-knowledge.mjs --dry-run   # see what it will do
node scripts/import-knowledge.mjs

# 2b. Seed the products table FROM the knowledge base, so catalogue and RAG agree.
#     The chat answers from two sources - products (what it can quote) and knowledge chunks
#     (what it can describe). If they drift, the bot describes items it cannot quote.
node scripts/seed-products.mjs --dry-run --show-specs
node scripts/seed-products.mjs

# 3. Compare the retrievers on the same 50 questions before committing to one
node tests/rag-eval/run-ab-retrieval.mjs --json tests/rag-eval/results-ab.json

# 4. Switch the app over once the numbers justify it
#    .env:  RETRIEVAL_MODE=vector     (or hybrid)
#           RETRIEVAL_TOP_K=5
#           # tune the floor via --min-similarity in the A/B first
```

Notes on the importer:

- **Titles are derived from filenames** (`rag-delivery-policy.md` → `Delivery Policy`). This is
  what makes the A/B harness's document mapping resolve. Renaming by hand will break the
  preflight — it fails loudly rather than scoring zero.
- **`rag-benchmark-sources.md` is excluded by default**, per Finding 1 below. Pass
  `--include-sources` to index it anyway. Move the Type 3 SPD / 10 m rule into the official
  knowledge file first, since that fact lives only in the manifest.
- **Re-running is safe.** Documents already present are skipped; `--replace` deletes and
  re-imports (chunks cascade).
- `backfill-embeddings.mjs` is only needed for rows imported *before* `OPENAI_API_KEY` existed.
  A fresh import via this script embeds as it goes.

The A/B harness caches query embeddings in `tests/rag-eval/.cache/` (gitignored), so only the
first run costs anything. It also preflights two things that otherwise produce silently wrong
scores: chunks with null embeddings, and fixture filenames that map to no
`knowledge_documents.title`.

### Tuning the similarity floor

`DEFAULT_MIN_SIMILARITY` is 0.35, which is a starting guess, not a tuned value. It trades the
two failure directions against each other:

- **too low** — unanswerable questions still receive chunks, and N01-N10 start fabricating
- **too high** — legitimate paraphrased questions retrieve nothing and the bot stonewalls

Sweep it and read both columns together, since the right value is the one that maximises
abstention on negatives without costing answerable-rate on positives:

```bash
for s in 0.20 0.30 0.35 0.40 0.50; do
  node tests/rag-eval/run-ab-retrieval.mjs --modes vector --min-similarity $s
done
```

### Before the live run

The live pass only measures something real if all three hold:

1. `DEEPSEEK_API_KEY` is set — otherwise `/api/ai-chat` returns canned fallback strings and you
   are grading templates, not the model.
2. The six `data/*.md` files are loaded into Supabase `knowledge_chunks` via
   `POST /api/admin/knowledge`. If they aren't, `SUPPORT KNOWLEDGE` is empty and every policy
   question fails for the wrong reason.
3. The catalogue is seeded, since product questions are answered from `CATALOGUE FACTS` rather
   than the knowledge chunks.

Check 2 with `GET /api/admin/knowledge` — it reports chunk counts per document and whether
embeddings were generated.

## What the offline pass found

Corpus: 15 chunks across 6 documents.

| Metric | Result |
| --- | --- |
| Recall@1 | 25/40 (62.5%) |
| Recall@3 | 40/40 (100%) |
| Fully answerable from top-3 | 39/40 (97.5%) |
| MRR | 0.804 |

Read Recall@3 with care. The corpus is only 15 chunks, so top-3 is 20% of the entire KB —
near-perfect recall is close to the floor, not a strong result. Recall@1 and the `--k 1` run
(52.5% answerable) are the more honest signals.

**Finding 1 — `rag-benchmark-sources.md` poisons ranking.** In all 15 cases where the correct
document was not ranked first, the document that outranked it was `rag-benchmark-sources.md`.
That file is a sourcing manifest: it repeats every SKU inside long URL slugs
(`...idpn-n-vigi-1p-n-25a-c-curve-6000a-a-type-30ma-a9d32625.html`), so `scoreText` counts the
same token many times and it wins on almost any product query. It contains no answer content
the official knowledge file doesn't already carry. It should not be in the retrieval index.

**Finding 2 — three-document questions don't fit in top-3.** A09 needs product + payment +
delivery. Retrieval returned payment, SOP, and product — the delivery policy was pushed out, so
the lead time can't be answered. With `k = 3` and 3 required documents there is no margin for a
single intruder.

**Finding 3 — no term weighting.** `scoreText` adds 1 per matching term with a hardcoded ×5 for
`"socket"`, so a stopword-ish token counts the same as a SKU. Long documents accumulate score
simply by being long; there is no IDF and no length normalisation.

## Verified impact of the proposed fix

Re-running the offline pass with `rag-benchmark-sources.md` excluded from the index:

| Metric | Before | After |
| --- | --- | --- |
| Recall@1 | 62.5% | **100%** |
| MRR | 0.804 | **1.000** |
| Corpus | 15 chunks | 11 chunks |

One caveat, and it is the reason to do this carefully rather than just deleting the file: the
manifest holds exactly one fact the official knowledge file does not — the recommendation to fit
a Type 3 SPD when sensitive loads sit more than 10 m from a Type 2 iPRD (question D29). The
official file lists which SPD types exist but not that siting rule. So the order is:

1. Move the Type 3 / 10 m recommendation into the Acti9 iPRD card in
   `supplierflow-official-knowledge.md`.
2. Drop `rag-benchmark-sources.md` from the retrieval index — keep it in the repo as a sourcing
   record, just don't ingest it. Source URLs already live on each knowledge card.
3. Raise the knowledge top-k in `app/api/ai-chat/route.ts` from 3 to 5, which is what A09 needs.
4. Add IDF weighting and length normalisation to `scoreText`.

Re-run the offline pass after each step — it takes under a second.
