# Jev experiment — baseline audit (Phase 0)

## Implementation under test

- Previous benchmark (135/139 legacy, 129/139 Jev-assisted) ran on the
  working tree at commit `64e9526` ("Feat : Add Jev decision routing") with
  **uncommitted changes**. There is no exact commit for the benchmarked code;
  this experiment rebases that work and re-benchmarks all four groups.
- Env (names only, no values): `DECISION_ROUTER_ENABLED` (default false),
  `DECISION_PROVIDER` (`jev` default, `heuristic` for Group B),
  `DECISION_SELECTIVE` (Group C), `TYPESAFE_API_KEY`,
  `TYPESAFE_DEFAULT_MODEL` (`jev-latest`), `DECISION_THRESHOLD` (0.5),
  `DECISION_TIMEOUT_MS` (1500), `DECISION_EVIDENCE_TOP_K` (follow per-request
  limit),   `DECISION_EVIDENCE_BUDGET_CHARS` (12000). Retrieval defaults
  unchanged: `RETRIEVAL_MODE=keyword`, `RETRIEVAL_TOP_K=5`,
  `RETRIEVAL_RERANKER=lexical`, `QUERY_REWRITE_MODE=history`.

## Previous benchmark failures (from results-live-after.json)

| Case | After source | Cause class |
|---|---|---|
| D66, A38, A43, A44 | jev/heuristic | exact-only plans, 0 chunks — no keyword safety net |
| N04, N17 | heuristic fallback | 6–10 chunks (vs 5 legacy) — over-retrieval leaked trap figures |
| A39 | keyword, 5 chunks | canned fallback as answer — suspected generation failure |
| D14, P08, A09 | both runs | pre-existing fixture/model drift, not routing |
| A06 | — | fail→pass under Jev: the one genuine multi-query win |

Fallback telemetry: 59/139 (42.4%) = 50 `jev-unavailable` + 9
`jev-empty-decision`; routing p50/p95 834/5883 ms at concurrency 5.
Phase 6 probe later showed this was concurrency-induced (p95 4884 ms at
concurrency 5 vs 720 ms at concurrency 2); all experiment runs below use
concurrency 2.

## N17/N23 grader fixes (documented, not silent)

- N17: `must_not_contain: "sst rate is"` matched the abstention "No SST
  rate is stated". Moved to negation-aware `must_not_match`:
  `(?<!\bno\s)(?<!\bnot\s)sst rate is`. Numeric guards unchanged.
- N23: identical flaw — `must_not_contain: "price is"` matched "no price
  is listed". Moved to `(?<!\bno\s)(?<!\bnot\s)price is\b`.
- Regression tests added in `grader.test.mjs` for both. No other fixture
  expectations modified.

## Four-group results (2026-09-21, concurrency 2, same corpus/prompt/model)

| Group | Pass | Direct | Adver. | Neg | Hallu. | p50/p95 total | DeepSeek $/q | Extra |
|---|---|---|---|---|---|---|---|---|
| A legacy | 135/139 | 68/70 | 42/44 | 25/25 | 0% | 3888/7790 | baseline | control |
| B determ. multi, no Jev | **138/139** | 69/70 | 44/44 | 25/25 | 0% | **3705/7304** | lowest | +D31,A06,A09,D57 / −P08 |
| C selective Jev | 137→**138**/139* | 70/70 | 43/44 | 24→**25**/25* | 0%* | 3887/7579 | lowest | 106 simple→legacy, 33→Jev, 0 true fallbacks |
| D Jev all | 135/139 | 67/70 | 43/44 | 25/25 | 0% | 4339/8118 | +$0.000020/q Jev | +D31,A06,D57 / −D14,P01,D60 |

\* C's N23 failure is the grader false positive fixed above; its answer
("no price is listed") is a correct abstention, verified clean under the
fixed guards. Effective C: 138/139, 0% hallucination.

Flips vs legacy control:
- B fixes D31 (B-curve range), A06 (30 kW contactor), A09 (multi-hop),
  D57 (Acti9 families); newly fails P08 (LED 2-year trap leaked via the
  extra policy op — the residual over-retrieval cost).
- D fixes D31, A06, D57; newly fails D14 (coil trap), P01 (Klang Valley
  delivery), D60 (iPRD1 vs iPRD) — all Jev-routed; A09 still fails.
- Latency: B is fastest overall; D adds ~450 ms p50 for routing.
- Jev cost is negligible ($0.000013–0.000020/query vs ~$0.0003 DeepSeek).

## Routing quality (offline, deterministic)

- Dev set (36): intent exact 97.2%, F1 98.8%, op precision/recall
  97.7%/100%. Known gap: R27 family reference over-fires lookup+supplier.
- Held-out (12, never tuned on): intent exact 91.7%, F1 98.0%, op
  precision/recall 96.3%/100%. Gaps: H09 brand-word supplier extra.
- Recall is 100% on both sets: required intents/ops are never missed.
- Jev live routing (24-case): exact 70.8%, P 87.3%, R 98.2% @0.5.

## Recommendation

Ship **Group B (deterministic multi-query, no Jev)** behind the existing
flag default-off, then enable after one confirmatory re-run: it is the only
group that beats the control on accuracy (138 vs 135), holds 0%
hallucination, needs no API key, adds ~1 ms routing, and is fully
deterministic. Keep selective Jev (C) as the experiment arm: effectively
tied with B but pays API cost/latency for no measured gain on this fixture.
Do not ship D: Jev-for-all ties the control while adding latency, cost,
and three routing regressions (D14/P01/D60). Revisit Jev if the corpus
grows adversarial multi-hop cases where deterministic decomposition
provably fails — that is the gap Jev was bought for, and this fixture does
not yet contain it.
