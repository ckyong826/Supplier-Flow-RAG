// SF-JEV-002: feature flag + environment configuration.
//
// The router is server-side only. TYPESAFE_API_KEY is only ever handed to
// the official SDK as the outbound Bearer token -- never logged, never
// returned, never sent to the browser.

/** @param {any} [env] */
export function getDecisionConfig(env = process.env) {
  return {
    enabled: String(env.DECISION_ROUTER_ENABLED || "false").toLowerCase() === "true",
    // Who produces intents: "jev" (official SDK) or "heuristic" (deterministic,
    // no API calls -- Group B of the controlled experiment).
    provider: (env.DECISION_PROVIDER || "jev").toLowerCase(),
    // Selective routing (Group C): Jev is called only for complex-query
    // candidates; simple queries keep the legacy path without any Jev call.
    selective: String(env.DECISION_SELECTIVE || "false").toLowerCase() === "true",
    // Official TypeSafe credentials. The key is only ever handed to the SDK
    // as the outbound Bearer token -- never logged or returned.
    apiKey: env.TYPESAFE_API_KEY || "",
    model: env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
    threshold: (() => {
      const raw = Number(env.DECISION_THRESHOLD);
      return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
    })(),
    timeoutMs: (() => {
      const raw = Number(env.DECISION_TIMEOUT_MS ?? env.LAYA_TIMEOUT_MS);
      return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10000) : 1500;
    })(),
    // Global evidence budget: max chunks merged from all operations and max
    // characters forwarded to generation. Extra operations must not grow
    // the final context automatically.
    evidenceTopK: (() => {
      const raw = Number(env.DECISION_EVIDENCE_TOP_K);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0; // 0 = follow per-request limit
    })(),
    evidenceBudgetChars: (() => {
      const raw = Number(env.DECISION_EVIDENCE_BUDGET_CHARS);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 12000;
    })(),
    fallback: (env.DECISION_FALLBACK || "existing").toLowerCase(),
  };
}

/** True only when the router should be attempted for this request.
 * @param {any} [env]
 */
export function shouldAttemptRouter(env = process.env) {
  const config = getDecisionConfig(env);
  if (!config.enabled) return false;
  return config.provider === "jev";
}
