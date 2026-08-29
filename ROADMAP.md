# SupplierFlow — Evaluation Roadmap

Turning a working RAG demo into a measured system.

| | |
|---|---|
| **Now** | 3.65 / 5 |
| **After Phase 2** | 4.5 / 5 |
| **Ship point** | ~8 working days |
| **Status** | chat currently 502s (migration 0003 unapplied) |

---

## ⛔ Read first: techniques cannot be evaluated on an 11-chunk corpus

The plan is CRAG, multi-representation, ColBERT and RAPTOR to raise the metrics. On the corpus as it stands, none of them can raise anything — and none of them can visibly fail either.

All three existing retrieval modes score **recall@1 = 0.800** and **MRR = 0.800**. They are not tied because they are equally good. They are tied because almost any method finds the right chunk when there are eleven of them.

```
TODAY                          AFTER PHASE 1
5 docs · 11 chunks             ~50 docs · ~300 chunks

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

## Phase 1 — Corpus expansion · 3–4 days ⛔ THE GATE

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

You are on fixed 180 words, no overlap. Run against 15% overlap and semantic chunking. Three runs, one table, a legitimate finding either way.

### 1.4 Re-label ground truth by hand

~120–150 questions mapped to correct chunk IDs. Budget a full day. Binary relevance is enough — skip graded relevance unless you later want nDCG.

This is the expensive part and it is what makes every number downstream real.

---

## Phase 2 — RagEvaluator · 2–3 days ✅ SHIP HERE

`tests/rag-eval/` already has a 50-question set, an A/B runner and a grader. **Extend it — do not rebuild it.** Rewriting working code to call it yours costs days and adds nothing.

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

---

## Phase 3 — Techniques, by measured return · 3–8 days

Stop at any boundary. Each is CV-complete on its own.

| Technique | Days | Verdict | Why |
|---|---|---|---|
| **Cross-encoder reranking** | 1–2 | **DO** | Best return in the plan, and *missing from your list*. Retrieve top-20, rerank (`bge-reranker-base`), keep 3. Usually the largest measured gain in RAG; fixes precision@k directly and gives a better abstention gate than a cosine floor. |
| **Query rewriting** | 1 | **DO** | Handles *"what are **their** payment terms?"* — only resolvable from chat history. You have multi-turn chat, so this is a live failure today. Add HyDE as a second A/B arm. |
| **Multi-representation indexing** | 1–2 | **DO** | On your list, and right. Embed summaries, retrieve full documents. Well matched to policy docs where a 180-word window cuts the answer in half. |
| **CRAG** | 2–3 | **IF TIME** | Best thematic fit — it *is* your abstention thesis with a published name. Skip the paper's web-search fallback; closed corpus, so abstain instead. A deliberate deviation from a paper is a good interview beat. |
| **RAPTOR** | 4–6 | **DEFER** | Needs genuine corpus depth. At 400 chunks it starts being defensible; below that it is ceremony. Only after Phase 1 succeeds. |
| **ColBERT** | — | **SKIP** | Per-token vectors blow up the index 10–100×, pgvector has no native MaxSim, and at your scale it will not beat a reranker you can build in a day. **Knowing why you skipped it is the better interview answer.** |

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
| 03 · Tier 1 | 3–5 | 12 | 4.70 |
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
  150-question hand-labelled set including adversarial, contradictory and
  unanswerable cases.
- Used it to A/B six retrieval configurations, shipping cross-encoder
  reranking and query rewriting and rejecting two approaches that showed
  no measurable gain at corpus scale.
- Engineered for abstention over recall: retrieval gating so the system
  returns nothing rather than passing the model authoritative-looking
  context for questions the corpus cannot answer — 0% hallucination on
  unanswerable questions.
- Designed a 20-table Postgres schema covering RFQ, quotation,
  per-customer price overrides, inventory ledger and audit logging.

Tech: TypeScript, Postgres/pgvector, OpenAI embeddings, DeepSeek,
cross-encoder reranking, Cloudflare Workers
```

Every italicised number above is a placeholder until a harness run produces it. Nothing goes in that the evaluator did not measure.

---

*Personal project · synthetic corpus · scored against career-ops `modes/project.md`*
