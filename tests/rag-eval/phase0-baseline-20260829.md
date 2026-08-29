# SupplierFlow Phase 0 baseline — 2026-08-29

Command:

```text
node tests/rag-eval/run-live-eval.mjs --base http://localhost:3100 --delay 400
```

## Checks

- Migration `0003_chat_session_ownership.sql`: verified through `GET /api/ai-chat/session` returning HTTP 200.
- `npm test`: passed — 41 tests, 0 failures.
- Build: passed.

## Live evaluator output

| Metric | Result |
|---|---:|
| Overall pass rate | 45/50 (90.0%) |
| Direct lookup | 29/30 (96.7%) |
| Adversarial | 7/10 (70.0%) |
| Negative questions passed | 9/10 (90.0%) |
| Negative failures counted as hallucination | 1/10 (10.0%) |
| p50 latency | 4,490 ms |
| p95 latency | 8,773 ms |

## Failures

- `P10`: omitted the `3 working days` follow-up period.
- `A05`: omitted the `C curve` while comparing the two RCBOs.
- `A09`: omitted the `1–2 working days` Klang Valley delivery fact.
- `A10`: abstained instead of recommending a technically suitable equivalent.
- `N02`: the grader flagged `currently available`; the answer otherwise said live stock could not be confirmed. Inspect this guard before treating it as a confirmed hallucination.

## Interpretation limits

The live runner grades answer text but does not record the retrieved support chunks. Therefore these results cannot yet distinguish retrieval failure from generation failure on a per-question basis, and the `10.0%` figure is a negative-case grader-failure rate rather than proof that 10% of answers were ungrounded.

No retrieval implementation changes were made during Phase 0.
