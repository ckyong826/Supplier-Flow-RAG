# SupplierFlow — Evaluation Roadmap

Turning a working RAG demo into a measured system.

| | |
|---|---|
| **Now** | 4.70 / 5 |
| **After Phase 2** | 4.5 / 5 |
| **After Phase 3 Tier 1** | 4.7 / 5 |
| **Ship point** | ~8 working days |
| **Status** | Phase 3 Tier 1 complete. File corpus: 44 docs / 159 chunks; fixture 139 questions |

---

## Read first: keep technique claims tied to measurements

The plan is CRAG, multi-representation, ColBERT and RAPTOR to raise the metrics. The file corpus is now
159 chunks, which clears the Phase 1 target of 150–400 chunks. Technique claims still need their own
controlled A/B evidence.

The earlier 11-chunk baseline had all three retrieval modes at **recall@1 = 0.800** and
**MRR = 0.800**. They were tied because almost any method found the right chunk in that tiny corpus.

```
 EARLIER BASELINE               AFTER PHASE 1
5 docs · 11 chunks             44 docs · 159 chunks

● ● ● ○ ○ ○ ○ ○ ○ ○ ○          ● ● ● ○○○○○○○○○○○○○○○○○○○○○○○○
                                    ○○○○○○○○○○○○○○○○○○○○○○○○○○
retrieved per query                 ○○○○○  ... × 300
3 / 11 = 27%
                               retrieved per query
recall@1 = 1.00 means          3 / 300 = 1%
almost nothing
                               now a method can win or lose
```

Bolt RAPTOR onto this and you get 0.800 again, two weeks later. Then in the interview: *"I implemented RAPTOR."* → *"What did it improve?"* → *"...nothing measurable."* That is a worse position than not having done it.

**Corpus expansion is the gate, not a parallel task.** Expect recall to *drop* — a believable 0.82 is worth far more than a meaningless 1.00.

---

## Phase 0 — Unblock · 0.5 days

Nothing else counts while it is broken.

1. Apply migration 0003 — `chat_sessions.owner_token` is missing and every chat request 502s.
2. Run `npm test`; confirm all 9 test files pass.
3. Reproduce the existing eval end to end: 0.94 pass, 0.00 hallucination.
4. Start committing in small increments. 3 commits for 9k lines gives you no development story — from here, 5–15 commits per phase.

---

## Phase 1 — Corpus expansion · 3–4 days ✅ COMPLETE

Target **40–60 documents, 150–400 chunks** — the threshold where retrieval methods start separating measurably.

### 1.1 Source real documents

| Source | Why |
|---|---|
| Public supplier T&Cs, Incoterms 2020, credit/payment terms, warranty policies | Real, dense, genuinely ambiguous — good adversarial material |
| Manufacturer datasheets / spec sheets | Structured and numeric; tests exact-value retrieval |
| Freight, customs, HS-code guidance | Jargon-heavy; hard for keyword |
| Synthetic supplier policies you write | Fills gaps, gives you controlled contradictions |

Write synthetic docs only to fill gaps. An LLM-generated corpus evaluated by LLM retrieval is circular, and an interviewer will say so. Half real is enough to defend.

### 1.2 Plant hard cases deliberately

- **Near-duplicates** — two suppliers, different credit terms. Tests precision, not just recall.
- **Contradictions** — an old policy and its revision. Tests whether the system notices.
- **Numeric traps** — SST rate, credit limits, MOQ thresholds. Your code already names this failure mode; now you can measure it.
- **True negatives** — push from 10 to 25–30.

### 1.3 Re-chunk as an experiment

You are on fixed 100 words, no overlap. Run against 15% overlap and semantic chunking. Three runs, one table, a legitimate finding either way.

### 1.4 Re-label ground truth by hand

~120–150 questions mapped to correct chunk IDs. Budget a full day. Binary relevance is enough — skip graded relevance unless you later want nDCG.

### Batch 1 checkpoint · 2026-08-30

- Added five sourced reference documents for MCB curves, RCCB current types, SPD selection, TeSys auxiliary contacts, and Incoterms boundaries.
- Expanded the fixture from 50 to 60 questions, including 10 new reference/adversarial cases.
- Current corpus: 10 documents, 16 chunks.
- Live end-to-end result: 60/60 passed; negative questions 10/10; hallucination rate 0/10.
- Retrieval A/B at top-5: keyword Recall@1 88%, vector 94%, hybrid 94%; hybrid fully answerable 100% and abstained on 2/10 negatives.

This is a quality checkpoint, not the Phase 1 gate: 16 chunks is still too small for a final retrieval-technique claim. Continue adding real documents until the corpus is materially larger.

### Batch 2 checkpoint · 2026-08-30

- Added seven sourced reference documents for current limiting, RCCB installation and operating conditions, TeSys linked contacts, Incoterms cost/insurance, Malaysia SST scope, and HS-code lookup boundaries.
- Expanded the fixture from 60 to 70 questions: 43 direct lookups, 17 adversarial, and 10 negatives.
- File corpus: 17 documents, 23 chunks. The imported database reports 24 embedded chunks / 18 titles, so one existing extra document still needs cleanup or explicit exclusion before the final A/B benchmark.
- Offline top-5: Recall@1 81.7%, Recall@5 100%, fully answerable 100%, MRR 0.894.
- Offline top-3: Recall@3 96.7%; D38 and D42 missed their required reference chunk.
- Live response set: 70/70 after equivalent technical phrasings were added to the matcher; negative questions 10/10; hallucination rate 0/10.
- Post-import A/B at top-5: keyword Recall@1 78.3%, vector 95.0%, hybrid 96.7%; hybrid fully answerable 100% and abstained on 2/10 negatives.
- Aggregation queries now use a minimum retrieval budget of 10 chunks; this recovered A07's third product card, which ranked sixth.

Keep ordinary top-k at 5 for now. Continue corpus expansion before evaluating heavier retrieval techniques.

This is the expensive part and it is what makes every number downstream real.

### Batch 3 checkpoint · 2026-08-30

- Added six sourced reference documents for MCB selectivity, TeSys AC-1/AC-3 utilization, SPD electrical characteristics and connection length, and RCCB selective types and coordination.
- Expanded the fixture from 70 to 82 questions: 49 direct lookups, 23 adversarial, and 10 negatives.
- File corpus: 23 documents, 29 chunks. The database reports 30 embedded chunks / 24 titles, so the same one-extra-document cleanup remains open.
- Offline top-5: Recall@1 79.2%, Recall@5 100%, fully answerable 100%, MRR 0.884. Offline top-3: Recall@3 97.2%, fully answerable 95.8%; D38, D42, and A07 lose margin at top-3.
- Database keyword top-5: Recall@1 73.6%, Recall@5 100%, fully answerable 100%, MRR 0.860. Vector fully answerable fell to 40.3% because the 10-list IVFFlat index was still using its default one probe; floor 0 and top-10 did not recover the missing candidates.
- Added `supabase/migrations/0016_vector_probe_recall.sql` to set function-local `ivfflat.probes = 10`. Apply it in Supabase, then rerun the vector A/B before the next live pass.

Batch 3 is a source and retrieval checkpoint, not a live-generation result yet.

### Batch 4 checkpoint · 2026-08-30

- Added seven first-party reference documents for MCB temperature/DC applications, RCCB overcurrent protection and Type F devices, TeSys DC coils, SPD impulse-current waveforms, and Incoterms risk transfer.
- Expanded the fixture from 82 to 96 questions: 56 direct lookups, 30 adversarial, and 10 negatives.
- File corpus: 30 documents, 36 chunks. The database import reports 37 embedded chunks and still has one extra title beyond the fixture.
- Offline top-5 after retrieval wording fixes: Recall@1 80.2%, Recall@5 100%, fully answerable 100%, MRR 0.891.
- Two existing reference documents were refined after the import, so re-import them before the live pass. The vector probe migration is also still pending in Supabase.

Batch 4 is another corpus and retrieval checkpoint. Its documents are included in the final Phase 1 run below.

### Batch 5 checkpoint · 2026-08-31 · Phase 1 gate

- Added 14 first-party reference digests covering Acti9 iC60/RCBO/iPRD, TeSys Deca and overload relays, ABB S200/F200/RCD application, Eaton PF7/PLN6, and ICC Incoterms rules.
- Re-chunked the production corpus to fixed 100-word windows with no overlap. The file corpus is 44 documents / 159 chunks; the synchronized database reports 160 embedded chunks across 45 titles because the old `How to order?` document remains outside the source set.
- Expanded the fixture to 139 questions: 70 direct lookups, 44 adversarial cases, and 25 true negatives. Positive questions retain expected source documents and factual anchors; generated chunk IDs are checked by the retrieval runner.
- Offline chunking experiment at top-5:

  | Chunking | Chunks | Recall@1 | Recall@5 | Fully answerable | MRR |
  |---|---:|---:|---:|---:|---:|
  | Fixed 100 words | 159 | 82.5% | 100.0% | 100.0% | 0.905 |
  | 15% overlap | 187 | 81.6% | 100.0% | 99.1% | 0.900 |
  | Paragraph/heading semantic | 193 | 79.8% | 98.2% | 96.5% | 0.880 |

- Post-import A/B at top-5: keyword Recall@1 84.2%, vector 90.4%, hybrid 88.6%; all three reached 100% Recall@5, while fully answerable was 100.0% keyword, 98.2% vector, and 100.0% hybrid. Vector and hybrid each returned zero chunks for 3/25 negatives at the 0.35 similarity floor; keyword returned zero for 0/25 by design.
- Final live run: 139/139 passed at concurrency 2; direct 70/70, adversarial 44/44, negative 25/25, hallucination rate 0/25, median latency 3702 ms, p95 6676 ms.
- Phase 1 gate: **complete**. The corpus size, 25-negative coverage, three-way chunking experiment, retrieval A/B, and live generation checks are all evidenced in `tests/rag-eval/` JSON artifacts.

---

## Phase 2 — RagEvaluator · 2–3 days ✅ COMPLETE

`tests/rag-eval/` now has a 139-question set, an A/B runner and a grader. **Extend it — do not rebuild it.** Rewriting working code to call it yours costs days and adds nothing.

### Retrieval
```
recall@k        k ∈ {1, 3, 5, 10}
precision@k     ← NEW; missing today, exposes over-retrieval
MRR
hit-rate@k
nDCG@k          only if you do graded relevance
```

### Generation
```
answer accuracy       have: 0.94
hallucination rate    have: 0.00
faithfulness          NEW — claims traceable to retrieved context
context relevance     NEW — was retrieved context actually used
```

### Abstention — your differentiator
```
abstention precision   NEW — of the times it abstained, how often correctly
abstention recall      NEW — of unanswerable questions, how often it abstained
false-answer rate      NEW — answered confidently when it should have abstained
over-abstention rate   NEW — refused a question it could have answered
```

### Operational
```
p50 / p95 latency      NEW — split retrieval vs generation
tokens + cost / query  NEW
index build time, storage
```

**Precision@k matters most for you.** Retrieving 3 chunks when 1 is relevant is precision 0.33 — and that is *why* stuffing more context makes hallucination worse. Connects straight to the abstention work.

**Over-abstention is the honest counterweight.** A system that abstains on everything scores perfectly on hallucination. Measuring both directions shows you understand the trade-off you chose. Nobody builds these — it is the most interview-valuable thing in the plan.

Output: one command → one markdown table, every config a row. Commit results as JSON so history is auditable.

### Phase 2 final checkpoint

The evaluator now records retrieval precision/hit-rate at k = 1, 3, 5 and 10; deterministic
fixture-backed faithfulness/context-relevance signals; all four abstention metrics; retrieval vs
generation timing; token usage/cost estimates; and index build/storage evidence. nDCG is not
reported because the fixture has binary source relevance, not graded relevance.

Final retrieval A/B after the indexed rebuild (`results-phase2-ab-final.json`):

| Mode | k | Hit rate / Recall | Precision | Fully answerable |
|---|---:|---:|---:|---:|
| keyword | 1 | 83.3% | 83.3% | 67.5% |
| keyword | 3 | 97.4% | 52.0% | 98.2% |
| keyword | 5 | 100.0% | 38.1% | 100.0% |
| keyword | 10 | 100.0% | 25.8% | 100.0% |
| vector | 1 | 90.4% | 90.4% | 74.6% |
| vector | 3 | 99.1% | 55.8% | 93.9% |
| vector | 5 | 100.0% | 40.9% | 98.2% |
| vector | 10 | 100.0% | 27.0% | 99.1% |
| hybrid | 1 | 90.4% | 90.4% | 72.8% |
| hybrid | 3 | 100.0% | 55.0% | 98.2% |
| hybrid | 5 | 100.0% | 42.1% | 100.0% |
| hybrid | 10 | 100.0% | 27.1% | 100.0% |

Final live run (`results-phase2-live-final.json`) passed **139/139** at concurrency 5: direct
70/70, adversarial 44/44, negative 25/25, hallucination rate 0/25. Answer accuracy,
faithfulness and context coverage were 100%; mean context relevance was 37.5%. Abstention
precision and recall were 100%, false-answer rate and over-abstention rate were 0%.
Faithfulness is a deterministic proxy here: a passing answer whose expected facts occur in the
exact eval context. Context relevance is the fraction of returned chunks from expected source
documents. They are not an LLM judge.

Operational result: client latency p50/p95 3212/6575 ms; retrieval 301/371 ms; generation
2060/5467 ms; average 2,275 tokens and estimated $0.000392 per query. The index rebuild covered
44 source documents / 159 source chunks, producing 160 embedded database chunks including one
legacy `How to order?` chunk; 1,536-dimensional embeddings, 47,859 ms build time, 96,260 indexed
chunk-text bytes. Source evidence is in `tests/rag-eval/results-index-build.json`.

Phase 2 gate: **complete**. Phase 3 can now test reranking, query rewriting and
multi-representation as controlled A/B arms against this baseline.

---

## Phase 3 — Techniques, by measured return · 3–8 days ✅ TIER 1 COMPLETE

Stop at any boundary. Each is CV-complete on its own.

| Technique | Days | Verdict | Why |
|---|---|---|---|
| **Second-stage coverage reranking** | 1–2 | **SHIPPED (lexical proxy)** | Retrieve a 20-chunk candidate pool, then rerank by query coverage and exact identifiers before keeping the configured top-k. It is the dependency-free cross-encoder-shaped arm; no `bge-reranker-base` service is installed. |
| **History-aware query rewriting + HyDE** | 1 | **SHIPPED / OPT-IN** | History rewriting is the default. HyDE is a measured second arm for semantic mismatch, but stays opt-in because it adds another model call and materially increases latency. |
| **Multi-representation indexing** | 1–2 | **MEASURED / OPT-IN** | Extractive document summaries select candidate documents, then the system retrieves full chunks. The summary path is measured without pretending it is a separate neural embedding index. |
| **CRAG** | 2–3 | **EXISTING GATE** | The vector/hybrid similarity floor already gives closed-corpus abstention. No web-search fallback was added; a separate CRAG arm is optional. |
| **RAPTOR** | 4–6 | **DEFER** | Needs genuine corpus depth. At 400 chunks it starts being defensible; below that it is ceremony. Only after Phase 1 succeeds. |
| **ColBERT** | — | **SKIP** | Per-token vectors blow up the index 10–100×, pgvector has no native MaxSim, and at your scale it will not beat a reranker you can build in a day. **Knowing why you skipped it is the better interview answer.** |

### Phase 3 Tier 1 checkpoint · 2026-08-31

The three Tier 1 arms were implemented and measured against the frozen 139-question fixture.
The full live shipping candidate used `keyword` retrieval, the lexical coverage reranker and
history-aware rewriting. It passed **139/139**: direct 70/70, adversarial 44/44, negative 25/25,
with hallucination rate **0/25**. Client latency was p50/p95 **3281/6352 ms**; retrieval was
**398/425 ms**; generation was **2104/5147 ms**; average estimated cost was **$0.000388/query**.

Offline positive-question results at top-5:

| Arm | Recall@1 | Fully answerable@1 | Fully answerable@5 |
|---|---:|---:|---:|
| Baseline keyword | 82.5% | 67.5% | 100.0% |
| Coverage rerank | 89.5% | 74.6% | 100.0% |
| Multi-representation | 78.1% | 64.9% | 93.9% |
| Multi + rerank | 90.4% | 75.4% | 100.0% |

History-aware rewriting improved the live follow-up scenarios from **2/5 to 5/5**. HyDE improved
a four-question semantic-mismatch smoke set from **3/4 to 4/4**, but raised client p50 latency
from **2885 ms to 8513 ms**, so it remains opt-in. Multi-representation is also opt-in: the
combined arm improves rank-one retrieval, but the summary-only arm is weaker than the baseline.

The reranker is deliberately described as a lexical coverage proxy, not a neural cross-encoder;
an actual `bge-reranker-base` adapter needs a separately provided inference service. Evidence is
in `tests/rag-eval/results-phase3-offline.json`, `results-phase3-live-rewrite-final.json`,
`results-phase3-live-hyde.json` and `results-phase3-live-final.json`.

---

## The reframe

> An engineer who implemented four techniques and reports four improvements looks like someone who chased a checklist. An engineer who built a measurement harness, tested six approaches, shipped three and rejected three with data looks like someone you can trust with an architecture decision.

The second is much rarer and much more hireable. So **keep the negative results.** *"Hybrid fusion gained one question out of fifty on this corpus, so I kept keyword as the default"* is a **stronger** line than any improvement claim — because nobody fabricates a negative result.

---

## Stop points

| Phase | Days | Cumulative | Score |
|---|---|---|---|
| Today | — | — | 3.65 |
| 00 · Unblock | 0.5 | 0.5 | 3.90 |
| 01 · Corpus | 3–4 | 4.5 | 4.20 |
| **02 · Evaluator** | **2–3** | **7.5** | **4.50** ✅ |
| **03 · Tier 1** | **3–5** | **12** | **4.70** ✅ |
| 03 · CRAG | 2–3 | 15 | 4.80 |

**Ship at Phase 2** — ~8 days, and where the curve flattens. You are job hunting now; do not disappear for a month building RAPTOR while applications go unsent.

---

## ✕ Three claims that must not reach the CV

**✕ "100% retrieval recall"**
Over 11 chunks, top-k=3 retrieves 27% of the corpus every query. The first follow-up question ends the conversation.

**✕ "Agentic" / "tool use" / "function calling"**
It is regex intent detection plus scraping the model's prose output. Prompt-contract extraction is a defensible design choice; calling it function calling is a false claim.

**✕ Any duration claim**
3 commits across 9 days — nothing to evidence. If asked: *"about two weeks, committed in large batches."*

Also expect **"why not function calling?"**. The honest answer works: DeepSeek over raw fetch, and a prompt contract kept the response path single-pass and inspectable — but you would reach for tools if the action space grew.

---

## Target output — the CV entry after Phase 2

```
### SupplierFlow — B2B supplier catalogue assistant

- Built a retrieval-augmented assistant over wholesale catalogue, pricing
  and supplier policy documents with no orchestration framework —
  chunking, embedding, retrieval and rank fusion written directly against
  Postgres/pgvector.
- Built a RAG evaluation harness measuring retrieval (recall@k,
  precision@k, MRR), generation (accuracy, faithfulness, hallucination
  rate) and abstention (false-answer and over-abstention rate) across a
  139-question hand-labelled set including adversarial, contradictory and
  unanswerable cases.
- Used it to A/B six retrieval configurations, shipping a second-stage
  lexical coverage reranker and history-aware query rewriting; kept HyDE
  and multi-representation retrieval opt-in after measuring their trade-offs.
- Engineered for abstention over recall: retrieval gating so the system
  returns nothing rather than passing the model authoritative-looking
  context for questions the corpus cannot answer — 0% hallucination on
  unanswerable questions.
- Designed a 20-table Postgres schema covering RFQ, quotation,
  per-customer price overrides, inventory ledger and audit logging.

Tech: TypeScript, Postgres/pgvector, OpenAI embeddings, DeepSeek,
second-stage coverage reranking, Cloudflare Workers
```

Every italicised number above is a placeholder until a harness run produces it. Nothing goes in that the evaluator did not measure.

---

*Personal project · synthetic corpus · scored against career-ops `modes/project.md`*

---

# Phase 3 Tier 2 — CRAG, complete · 3.5 days

Full Corrective RAG (Yan et al., 2024), not the refinement stage alone. Built to learn the
architecture properly, adapted where a closed corpus makes the paper's design inapplicable.

## Study first — before any code

Read in this order. Each concept has a SupplierFlow instance; find it before moving on.

1. **The paper's premise.** Standard RAG assumes retrieval succeeded. CRAG asks: what if it
   didn't? Everything else follows from taking that question seriously.
2. **Retrieval confidence as a first-class signal.** Your cosine floor already computes one and
   throws away the gradient — it collapses a continuous score into a binary gate. CRAG keeps the
   gradient and routes on it.
3. **Three-way routing.** Correct / Incorrect / Ambiguous. Understand *why* three: a binary gate
   forces every uncertain case into one of two wrong behaviours — answer anyway, or refuse a
   question you could have answered. The middle path exists to hold that tension explicitly.
4. **Decompose-recompose.** Retrieved chunks contain relevant and irrelevant text. Refinement
   splits them into strips, scores each, drops the weak ones, and reassembles. This is a
   *precision* operation, not a recall one.
5. **The fallback.** The paper reaches for web search when retrieval fails. Understand why that
   is wrong here before adapting it — a breaker's breaking capacity sourced from the open
   internet is worse than an honest refusal.

**Checkpoint before building:** explain, in your own words, why CRAG cannot improve answer
accuracy on a corpus where retrieval never fails. If that is not obvious yet, re-read 1 and 3.

---

## Component 1 — Retrieval evaluator

Produces a graded confidence score in [0,1] for a (query, retrieved-set) pair. Two arms, A/B'd
against each other.

### Arm A — heuristic evaluator (default)

No extra model call, no latency cost, deterministic. Combines signals you already compute:

```
confidence = w1 * normalized_top_cosine
           + w2 * coverage_score        (existing reranker function)
           + w3 * identifier_match      (exact SKU/part-number hit: iC60N, S201, PF7)
           + w4 * score_margin          (top1 - top2; a flat distribution means nothing won)
```

`score_margin` is the signal most worth understanding. A high top-score with a flat tail means
the corpus does not actually discriminate on this query — a different failure from "nothing
matched", and one a threshold on top-score alone cannot see.

Fit the weights on a held-out slice of the fixture, never on the full set. Record the weights.

### Arm B — LLM-as-judge evaluator (opt-in)

One DeepSeek call scoring relevance of the retrieved set. More faithful to the paper (which
fine-tunes T5-large), but adds a round-trip.

**Expect it to lose on latency**, the way HyDE did. Measure it anyway — the comparison is the
result, and "the cheap heuristic matched the model judge at a fraction of the latency" is a
finding worth reporting.

**Validation, non-negotiable:** the evaluator's own accuracy must be measured before it is
trusted. Label each fixture question with whether retrieval *actually* succeeded, then score the
evaluator against those labels. An unvalidated evaluator is a second failure surface wearing the
costume of a fix.

---

## Component 2 — Three-way router

Two thresholds, three zones:

```
confidence >= tau_hi          -> CORRECT     -> refine -> generate
tau_lo < confidence < tau_hi  -> AMBIGUOUS   -> refine + broaden (higher k, relaxed floor)
                                             -> generate with explicit hedging
confidence <= tau_lo          -> INCORRECT   -> rewrite-and-retry once
                                             -> abstain if still low
```

Tune `tau_hi` and `tau_lo` on the held-out slice. Report the **route distribution** across the
fixture — if 139/139 route to CORRECT, the router is inert and you have learned something real
about your corpus rather than shipped a broken feature.

The AMBIGUOUS branch is the part with no analogue in your current system. It is why the full
implementation teaches more than refinement alone.

---

## Component 3 — Knowledge refinement (decompose-recompose)

1. **Decompose** each retrieved chunk into strips — sentences, or table rows.
2. **Score** each strip against the query with the existing coverage function.
3. **Filter** strips below threshold.
4. **Recompose** survivors in original document order, preserving provenance.

**Domain constraint, critical for this corpus:** a spec-table row is meaningless without its
header. `6 kA` alone is not an answer; `iC60N | breaking capacity | 6 kA` is. Detect table
structure and keep header context attached to any row that survives, or refinement will improve
your precision metric while destroying answer quality — the exact failure this project exists to
catch.

Measure: context relevance and tokens/query before and after, at unchanged answer accuracy.

---

## Component 4 — Closed-corpus fallback

The paper's web search is replaced by a two-step:

1. **Rewrite and retry once** — reformulate the query (reuse the existing rewriting arm) and
   re-retrieve. Cheap, and catches vocabulary mismatch rather than genuine absence.
2. **Abstain** if confidence is still below `tau_lo`.

Report how often step 1 rescues a query that step 2 would otherwise refuse. That number is the
entire justification for the retry existing — if it is zero, delete the retry and say so.

---

## The measurement problem, and the ablation that solves it

The fixture is saturated: 139/139 pass, Recall@5 = 100%. **The corrective path will never fire
under normal conditions, because retrieval never fails.** Measuring CRAG on the healthy system
produces a null result that says nothing about CRAG.

The standard answer is to inject the failure you cannot find naturally. Run three conditions
against the frozen fixture:

| Condition | Retrieval setting | Purpose |
|---|---|---|
| **A — healthy** | current config | Baseline. Confirms CRAG costs nothing when unneeded. |
| **B — degraded** | top-k = 1, or similarity floor raised, or N noise chunks injected | Manufactures the failures the corpus will not produce. |
| **C — degraded + CRAG** | B, with evaluator + router active | Does the corrective loop recover B toward A? |

**Recovery rate = (C - B) / (A - B).** That is the number that says whether CRAG works, and it is
obtainable on a saturated fixture. Degradation must be applied identically across arms and fixed
before the run.

This ablation design is itself worth more in an interview than the implementation: engineering
around an evaluation you cannot run directly is a harder skill than following a paper.

---

## Metrics to report

| Metric | Why |
|---|---|
| Route distribution (correct / ambiguous / incorrect) | Is the router inert? |
| Evaluator accuracy vs ground-truth retrieval success | Is confidence trustworthy? |
| Context relevance, before vs after refinement | The number this targets — currently 37.5% |
| Tokens/query, before vs after | Efficiency result at saturation — currently 2,275 |
| Recovery rate under degradation | Does the corrective loop actually correct? |
| Rewrite-retry rescue rate | Does step 1 of the fallback earn its place? |
| Latency delta, heuristic vs LLM-judge evaluator | The cost side of the trade |
| Answer accuracy and hallucination rate | Regression guard — must not fall from 139/139, 0/25 |

---

## Build order

| Step | Days |
|---|---|
| 1. Refinement (decompose-recompose) + table-header handling | 0.5 |
| 2. Heuristic evaluator + validation against retrieval-success labels | 1.0 |
| 3. Three-way router + threshold tuning on held-out slice | 0.5 |
| 4. Rewrite-and-retry fallback | 0.5 |
| 5. Degradation ablation, three conditions | 0.5 |
| 6. LLM-judge evaluator as second arm | 0.5 |
| **Total** | **3.5** |

One step at a time, measured against the frozen fixture, committed before the next.

## Honest labelling

Same convention as the coverage reranker and the deterministic faithfulness proxy:

- The evaluator is a **heuristic scorer**, not the paper's fine-tuned T5 — say so.
- The fallback is **rewrite-and-abstain**, not web search — a deliberate closed-corpus adaptation.
- If the router is inert on the healthy fixture, **report that**, and report the degraded-condition
  result next to it.

A null result reported next to the ablation that explains it is a stronger artifact than an
improvement claim nobody can reproduce.
