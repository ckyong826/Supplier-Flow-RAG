# SupplierFlow RAG correctness eval

139 questions over the 44 source documents in `data/`, with runners for offline
retrieval, live end-to-end answers, and controlled retrieval-technique A/B tests.

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
| `multi` | Extractive document-summary selection, then full-chunk retrieval. |

The app defaults to `keyword` plus history-aware rewriting and lexical coverage reranking. The
`vector`, `multi` and HyDE arms remain selectable for controlled evaluation.

Vector mode falls back to keyword if embedding fails, but **not** when it legitimately returns
zero rows — that empty result is the signal that nothing cleared the similarity floor, and
preserving it is what lets the model abstain instead of fabricate.

Production/import chunking uses fixed 100-word windows with no overlap. The offline runner also
supports `--chunking overlap15` and `--chunking semantic` for the Phase 1 comparison; those two
variants are experiment arms, not silently enabled production behaviour.

## Files

| File | Purpose |
| --- | --- |
| `rag-eval-questions.json` | The 139-question fixture: 70 direct lookups, 44 adversarial, 25 negatives |
| `match.mjs` | Shared matcher — token-boundary aware, so `type A` can't match inside `type AC` |
| `verify-groundtruth.mjs` | Checks the fixture itself against `data/` before it grades anything |
| `run-retrieval-eval.mjs` | Offline retrieval scoring (Recall/hit-rate@k, precision@k, fully answerable, MRR) |
| `run-ab-retrieval.mjs` | Keyword vs vector vs hybrid against the real Supabase corpus |
| `run-live-eval.mjs` | Live end-to-end scoring, split latency, usage/cost and abstention metrics |
| `run-phase3-eval.mjs` | Offline baseline/rerank/multi-representation comparison plus rewrite scoring |
| `run-phase3-live.mjs` | Live history-aware follow-up scenarios |
| `phase3-scenarios.json` | Five history-dependent follow-up cases |
| `grader.test.mjs` | Tests the grader, so it can't silently pass everything |
| `retrieval-modes.test.mjs` | Tests mode switching, fallback and fusion with stubbed I/O |

Related, outside this directory:

| File | Purpose |
| --- | --- |
| `app/api/ai-chat/knowledge-retrieval.mjs` | The shared retrieval module used by both the app and the A/B harness |
| `scripts/backfill-embeddings.mjs` | Embeds chunks inserted before `OPENAI_API_KEY` existed |
| `supabase/migrations/0002_vector_retrieval.sql` | Similarity floor, coverage function, ivfflat index |
| `supabase/migrations/0016_vector_probe_recall.sql` | Function-local IVFFlat probe count for vector recall |

## Question design

**70 direct lookups** — product specs, policy facts, and sourced reference definitions. One clear source chunk each.

**44 adversarial** — the cases that actually break RAG:

- near-duplicate SKUs: `F202A-40/0.03` vs `F202AC-40/0.03` (one letter apart, both 40 A / 30 mA),
  `F202AC-40/0.3` vs `F202AC-40/0.03` (0.3 vs 0.03), `LC1D09BNE` vs `LC1D09BD` (coil only)
- constraint filtering: "which contactor gives 30 kW at 400 V" when three cards state a kW figure
- aggregation across chunks: all 63 A ABB RCCBs and their residual currents
- multi-hop across documents: order cut-off + regional lead time; product + payment + delivery
- lexical mismatch: "out of stock" when the SOP says "unavailable"
- technical boundaries: MCB selectivity and temperature/DC applications, AC-1 versus AC-3, SPD ratings and wiring,
  RCCB coordination and Type F, TeSys DC coils, and Incoterms risk transfer

**25 negatives** — the answer is not in the KB and the system must abstain. Chosen so that a
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
| N11–N13 | SKU-specific price, stock and warranty values that are not commercial records |
| N14 | IP rating borrowed from a different product |
| N15–N17 | Singapore shipping charge, account credit amount and product SST rate |
| N18–N19 | MOQ and exact HS code, both absent from the cited product record |
| N20–N22 | More stock, warranty and coil-power traps on exact SKUs |
| N23–N25 | Replacement-cartridge price/stock and CIP insurance charge |

N09, N10, N16 and N17 are the highest-risk cases in the set: the exact commercial phrase is in
retrieved context with the requested number missing, which is the strongest possible invitation to
invent one.

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
node tests/rag-eval/run-retrieval-eval.mjs --chunking fixed --k 5 --json tests/rag-eval/results-retrieval.json
node tests/rag-eval/run-retrieval-eval.mjs --k 1     # sensitivity check

# 3b. Compare chunking choices offline
node tests/rag-eval/run-retrieval-eval.mjs --chunking overlap15 --k 5 --json tests/rag-eval/results-overlap15.json
node tests/rag-eval/run-retrieval-eval.mjs --chunking semantic --k 5 --json tests/rag-eval/results-semantic.json

# 4. Live end-to-end pass
npm run dev
node tests/rag-eval/run-live-eval.mjs --concurrency 2 --delay 400 --json tests/rag-eval/results-live.json
node tests/rag-eval/run-live-eval.mjs --only N01,N09,N10,N17,N18   # selected hallucination traps
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

# 3. Compare the retrievers on the same 139 questions before committing to one
node tests/rag-eval/run-ab-retrieval.mjs --k 5 --json tests/rag-eval/results-ab.json

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

- **too low** — unanswerable questions still receive chunks, and N01-N25 start fabricating
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
2. The 44 source `data/*.md` files are loaded into Supabase `knowledge_chunks` via
   `POST /api/admin/knowledge`. If they aren't, `SUPPORT KNOWLEDGE` is empty and every policy
   question fails for the wrong reason.
3. The catalogue is seeded, since product questions are answered from `CATALOGUE FACTS` rather
   than the knowledge chunks.

Check 2 with `GET /api/admin/knowledge` — it reports chunk counts per document and whether
embeddings were generated.

## Historical baseline before Phase 1 corpus additions

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

## Phase 1 batch 1 checkpoint

The first five reference documents expanded the fixture to 60 questions and the corpus to 10
documents / 16 chunks. The live run passed 60/60, including 10/10 negative questions with a 0%
hallucination rate. The A/B run at top-5 measured Recall@1 of 88% for keyword, 94% for vector,
and 94% for hybrid; hybrid reached 100% fully answerable positives and abstained on 2/10
negative questions.

These are checkpoint results, not the final Phase 1 claim. The corpus is still below the target
size, so add more real documents before drawing conclusions about retrieval techniques.

## Phase 1 batch 2 checkpoint

Seven additional sourced reference documents expanded the fixture to 70 questions and the corpus
to 17 documents / 23 chunks. Offline retrieval at top-5 scored Recall@1 81.7%, Recall@5 100%,
fully answerable 100%, and MRR 0.894. At top-3, Recall@3 and fully answerable were both 96.7%;
D38 and D42 lost the required reference chunk. Keep top-k at 5 until a larger corpus gives a
meaningful reason to reduce it. The live response set reached 70/70 after accepting equivalent
technical phrasing in the matcher; negatives remained 10/10 with a 0% hallucination rate. The
aggregation path now requests at least 10 chunks for `list`/`all`/`each`/`every` questions because
the third A07 product chunk ranked sixth. Ordinary questions still use the configured top-k.

The post-import A/B run at top-5 measured keyword Recall@1 78.3%, vector 95.0%, and hybrid
96.7%; hybrid reached 100% fully answerable positives and abstained on 2/10 negatives. The
database currently reports 24 embedded chunks / 18 titles while the fixture maps 17 documents,
so remove or account for the extra existing document before treating this A/B run as final.

## Phase 1 batch 3 checkpoint

Six additional sourced reference documents expanded the fixture to 82 questions and the file corpus
to 23 documents / 29 chunks. Offline top-5 scored Recall@1 79.2%, Recall@5 100%, fully answerable
100%, and MRR 0.884. At top-3, Recall@3 was 97.2% and fully answerable was 95.8%; D38, D42 and
A07 lost answer text from the smaller context.

The database keyword run at top-5 remained fully answerable (73.6% Recall@1, 100% Recall@5, MRR
0.860). The vector run fell to 40.3% fully answerable and sometimes returned fewer than five rows.
Floor 0 and top-10 produced the same misses, pointing to the ten-list IVFFlat index's default
one-probe search rather than the similarity floor or requested top-k. Migration
`supabase/migrations/0016_vector_probe_recall.sql` sets function-local `ivfflat.probes = 10`.
Apply it before the next vector A/B and live run.

## Phase 1 batch 4 checkpoint

Seven additional first-party reference documents expanded the fixture to 96 questions and the file
corpus to 30 documents / 36 chunks. Offline top-5 after retrieval wording fixes scored Recall@1 80.2%,
Recall@5 100%, fully answerable 100%, and MRR 0.891. The database import reports 37 embedded chunks;
one extra database title remains beyond the fixture. Two existing reference documents were refined
after import and must be re-imported before the live pass. No Batch 4 live or post-migration vector
result is claimed yet.

## Phase 1 batch 5 checkpoint — final gate

Batch 5 added 14 first-party reference digests for Acti9 iC60/RCBO/iPRD, TeSys Deca and overload
relays, ABB S200/F200/RCD application, Eaton PF7/PLN6, and ICC Incoterms rules. The fixture now has
139 questions: 70 direct lookups, 44 adversarial cases, and 25 true negatives. The production
chunker is fixed 100-word windows with no overlap; the file corpus is 44 documents / 159 chunks.

The offline top-5 chunking experiment measured:

| Chunking | Chunks | Recall@1 | Recall@5 | Fully answerable | MRR |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fixed 100 words | 159 | 82.5% | 100.0% | 100.0% | 0.905 |
| 15% overlap | 187 | 81.6% | 100.0% | 99.1% | 0.900 |
| Paragraph/heading semantic | 193 | 79.8% | 98.2% | 96.5% | 0.880 |

The synchronized database reports 160 embedded chunks across 45 titles: the extra `How to order?`
title is a pre-existing legacy document outside the 44-file source set. The A/B run still mapped all
44 fixture documents successfully. At top-5, keyword/vector/hybrid Recall@1 was 84.2%/90.4%/88.6%;
all three reached 100% Recall@5, with fully answerable rates of 100.0%/98.2%/100.0%. Vector and
hybrid retrieval returned no chunks for 3/25 negatives at the 0.35 floor; keyword returned none by
design.

The final live run passed 139/139 at concurrency 2: direct 70/70, adversarial 44/44, negative
25/25, hallucination rate 0/25, median latency 3702 ms and p95 6676 ms. Phase 1 is complete; Phase 2
is the next stop point.

## Phase 2 evaluator checkpoint

Phase 2 is complete. The current final evidence is:

```bash
node tests/rag-eval/run-retrieval-eval.mjs --k 5 --json tests/rag-eval/results-phase2-offline.json
node tests/rag-eval/run-ab-retrieval.mjs --k 5 --json tests/rag-eval/results-phase2-ab-final.json
node tests/rag-eval/run-live-eval.mjs --base http://localhost:3100 --delay 400 --concurrency 5 --json tests/rag-eval/results-phase2-live-final.json
```

The live runner prints one Markdown Phase 2 table. It sends `x-rag-eval: 1`; the route exposes
the extra `ragEval` payload only for that header outside production, so normal users do not
receive retrieved context or token telemetry.

Final live result: **139/139** — direct 70/70, adversarial 44/44, negative 25/25, hallucination
rate 0/25. Answer accuracy, faithfulness and context coverage were 100%; context relevance was
37.5%. Abstention precision/recall were 100%; false-answer and over-abstention rates were 0%.
Client latency was p50/p95 3212/6575 ms, split retrieval 301/371 ms and generation 2060/5467 ms.
Average usage was 2,275 tokens and estimated cost was $0.000392/query.

Faithfulness is a deterministic fixture-backed proxy: the answer passed and its expected facts
were present in the exact context sent to the model. Context relevance is the proportion of
returned chunks whose titles match an expected source document. Neither is an LLM judge. nDCG is
omitted because the fixture has binary, not graded, relevance labels.

The index evidence records 44 source documents / 159 source chunks, 160 embedded database chunks
(including one legacy `How to order?` chunk), 1,536-dimensional embeddings, a 47,859 ms rebuild,
and 96,260 indexed chunk-text bytes in `tests/rag-eval/results-index-build.json`.

## Phase 3 Tier 1 checkpoint

The three Tier 1 technique arms are implemented and measured against the same frozen fixture.
The default path remains keyword retrieval, now with history-aware rewriting and a dependency-free
second-stage lexical coverage reranker. The reranker retrieves up to 20 candidates, promotes exact
identifiers and query coverage, and keeps the configured top-k. It is a proxy for the ranking stage,
not a claim that `bge-reranker-base` is installed.

Offline positive-question results at top-5 (114 answerable questions):

| Arm | Recall@1 | Fully answerable@1 | Fully answerable@5 |
| --- | ---: | ---: | ---: |
| Baseline keyword | 82.5% | 67.5% | 100.0% |
| Coverage rerank | 89.5% | 74.6% | 100.0% |
| Multi-representation | 78.1% | 64.9% | 93.9% |
| Multi + rerank | 90.4% | 75.4% | 100.0% |

History-aware live follow-ups improved from **2/5 to 5/5**. HyDE improved a four-question
semantic-mismatch smoke set from **3/4 to 4/4**, but increased client p50 latency from **2885 ms**
to **8513 ms**, so it remains opt-in. Multi-representation is also opt-in because its summary-only
arm is weaker than baseline, while the combined arm is useful mainly for rank-one retrieval.

The full live shipping candidate (`keyword` + lexical rerank + history rewrite) passed **139/139**:
direct 70/70, adversarial 44/44, negative 25/25, hallucination rate **0/25**. Client latency was
p50/p95 **3281/6352 ms**; retrieval **398/425 ms**; generation **2104/5147 ms**; average cost
**$0.000388/query**.

Evidence and rerunnable commands:

```bash
node tests/rag-eval/run-phase3-eval.mjs --k 5 --candidates 20 --json tests/rag-eval/results-phase3-offline.json
node tests/rag-eval/run-phase3-live.mjs --base http://localhost:3100 --json tests/rag-eval/results-phase3-live-rewrite-final.json
node tests/rag-eval/run-live-eval.mjs --base http://localhost:3100 --delay 400 --concurrency 5 --retrieval-mode keyword --reranker lexical --rewrite history --json tests/rag-eval/results-phase3-live-final.json
```

HyDE and `multi` are deliberate opt-in experiments. The vector similarity floor remains the
closed-corpus CRAG-style abstention gate; no web-search fallback was added.

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
