// SF-JEV-002: feature flag + environment configuration.
//
// The router is server-side only. TYPESAFE_API_KEY is only ever handed to
// the official SDK as the outbound Bearer token -- never logged, never
// returned, never sent to the browser.

/** @param {any} [env] */
export function getDecisionConfig(env = process.env) {
  return {
    enabled: String(env.DECISION_ROUTER_ENABLED || "false").toLowerCase() === "true",
    provider: (env.DECISION_PROVIDER || "jev").toLowerCase(),
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
