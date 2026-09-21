// SF-JEV-007: lightweight per-request decision diagnostics.
// Never logs message content; records shapes, latencies, and outcomes.

/** @param {{ queryId?: string, provider?: string }} [input] */
export function createDiagnostics({ queryId, provider = "jev" } = {}) {
  const started = Date.now();
  return {
    query_id: queryId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`),
    decision_provider: provider,
    detected_intents: [],
    retrieval_operations: [],
    routing_latency_ms: null,
    retrieval_latency_ms: null,
    generation_latency_ms: null,
    total_latency_ms: null,
    fallback_used: false,
    fallback_reason: null,
    started,
  };
}

/** @param {any} diagnostics @param {any} [patch] */
export function finishDiagnostics(diagnostics, patch = {}) {
  const done = { ...diagnostics, ...patch };
  done.total_latency_ms = Date.now() - (diagnostics.started ?? Date.now());
  delete done.started;
  return done;
}
