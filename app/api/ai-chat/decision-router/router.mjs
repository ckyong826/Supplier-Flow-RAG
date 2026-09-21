// SF-JEV-002/003/007: provider abstraction + fallback orchestrator.
//
// Contract:
//   routeQuery({ query, history, products }) ->
//   { normalized, source: "jev"|"heuristic"|"disabled",
//     routingLatencyMs, fallbackUsed, fallbackReason, usage }
//
// Chain (first usable result wins):
//   TypeSafe Jev (official SDK) -> deterministic heuristic ->
//   existing retrieval pipeline (caller falls back, no extra LLM call).
// - Invalid Jev payloads are NEVER treated as "general"; they fall back.
// - Auth failures surface as jev-auth-error in diagnostics (no credentials
//   included); they are NOT retried.

import { getDecisionConfig } from "./config.mjs";
import { fetchJevRoute } from "./jev.mjs";
import { normalizeRouteResult, defaultThreshold } from "./labels.mjs";
import { heuristicRoute } from "./heuristic.mjs";
import { buildRouterContext } from "./conversation.mjs";
import { extractAndValidateSkus } from "./sku.mjs";

/**
 * Whether a *resolved* config should attempt Jev.
 * @param {any} [config]
 */
export function shouldAttemptResolved(config) {
  if (!config?.enabled) return false;
  return config.provider === "jev";
}

/**
 * @param {{ query: string, history: any, products: any[] }} input
 * @param {{ config?: any, client?: any, threshold?: number }} [options]
 * `client` injects a stubbed Jev client for tests.
 */
export async function routeQuery(
  { query, history = [], products = [] } = {},
  { config = getDecisionConfig(), client, threshold } = {},
) {
  const started = Date.now();
  const effectiveThreshold = threshold ?? config.threshold ?? defaultThreshold();
  const context = buildRouterContext(history);
  const skus = extractAndValidateSkus(query, products);

  const heuristicFallback = (fallbackReason) => {
    const heuristic = heuristicRoute(query, context, effectiveThreshold);
    return {
      normalized: heuristic,
      source: "heuristic",
      routingLatencyMs: Date.now() - started,
      fallbackUsed: true,
      fallbackReason,
      usage: null,
      context,
      skus,
    };
  };

  if (!shouldAttemptResolved(config)) {
    const heuristic = heuristicRoute(query, context, effectiveThreshold);
    return {
      normalized: heuristic,
      source: "disabled",
      routingLatencyMs: Date.now() - started,
      fallbackUsed: true,
      fallbackReason: "router-disabled",
      usage: null,
      context,
      skus,
    };
  }

  const raw = await fetchJevRoute(
    {
      query,
      history: context,
      productIds: skus.productIds,
      threshold: effectiveThreshold,
      model: config.model,
    },
    { config, client },
  );

  if (raw?.error) {
    return heuristicFallback(raw.error);
  }
  const normalized = normalizeRouteResult(raw, effectiveThreshold);
  if (normalized && normalized.detectedIntents.length > 0) {
    return {
      normalized,
      source: "jev",
      routingLatencyMs: raw.routingLatencyMs ?? Date.now() - started,
      fallbackUsed: false,
      fallbackReason: null,
      usage: raw.usage || null,
      context,
      skus,
    };
  }
  // Invalid or empty Jev result: fall back, but record why. An invalid
  // result must not become a silent "general conversation".
  return heuristicFallback(normalized ? "jev-empty-decision" : "jev-invalid-response");
}
