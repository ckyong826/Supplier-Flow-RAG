// SF-JEV-002/003/007 + experiment phases 1-2: provider abstraction,
// fallback orchestrator, and selective routing.
//
// Contract:
//   routeQuery({ query, history, products }) ->
//   { normalized, source, strategy: "legacy"|"multi", jevAttempted,
//     routingLatencyMs, fallbackUsed, fallbackReason, usage }
//
// Strategies (decided here, executed by the caller):
//   "legacy" -> original single-query retrieval; Jev was not used or failed.
//   "multi"  -> deterministic or Jev-assisted multi-query planning.
//
// Provider chain:
//   provider=heuristic -> deterministic multi-query, no Jev call (Group B).
//   provider=jev, selective gate says simple -> legacy, no Jev call (Group C).
//   provider=jev, complex or non-selective -> Jev attempt (Groups C/D);
//     Jev timeout/invalid/auth failure -> legacy, never heuristic-multi.
// A Jev failure must be able to fall back to the ORIGINAL implementation;
// heuristic routing is not equivalent to legacy retrieval.

import { getDecisionConfig } from "./config.mjs";
import { fetchJevRoute } from "./jev.mjs";
import { normalizeRouteResult, defaultThreshold } from "./labels.mjs";
import { heuristicRoute } from "./heuristic.mjs";
import { buildRouterContext } from "./conversation.mjs";
import { extractAndValidateSkus } from "./sku.mjs";
import { isComplexCandidate } from "./complexity.mjs";

/**
 * Whether a *resolved* config should attempt any routing.
 * @param {any} [config]
 */
export function shouldAttemptResolved(config) {
  if (!config?.enabled) return false;
  return config.provider === "jev" || config.provider === "heuristic";
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
  const done = (partial) => ({
    normalized: null,
    source: "disabled",
    strategy: "legacy",
    jevAttempted: false,
    routingLatencyMs: Date.now() - started,
    fallbackUsed: true,
    fallbackReason: "router-disabled",
    usage: null,
    context,
    skus,
    complexity: null,
    ...partial,
  });

  if (!shouldAttemptResolved(config)) {
    return done({ normalized: heuristicRoute(query, context, effectiveThreshold) });
  }

  // Group B: deterministic multi-query planning without any Jev API call.
  if (config.provider === "heuristic") {
    return done({
      normalized: heuristicRoute(query, context, effectiveThreshold),
      source: "heuristic-multi",
      strategy: "multi",
      fallbackUsed: false,
      fallbackReason: null,
    });
  }

  // Group C: selective routing -- simple queries keep legacy RAG with no
  // Jev call at all.
  let complexity = null;
  if (config.selective) {
    complexity = isComplexCandidate({
      query,
      history: context,
      productIds: skus.productIds,
      unknownSkus: skus.unknown,
    });
    if (!complexity.complex) {
      return done({
        normalized: heuristicRoute(query, context, effectiveThreshold),
        source: "selective-simple",
        // Not a fallback: legacy for simple queries is the designed path.
        fallbackUsed: false,
        fallbackReason: "selective-simple-query",
        complexity,
      });
    }
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

  // Any Jev failure falls back to the ORIGINAL retrieval implementation.
  if (raw?.error) {
    return done({
      normalized: heuristicRoute(query, context, effectiveThreshold),
      source: "heuristic",
      fallbackReason: raw.error,
      jevAttempted: true,
      complexity,
    });
  }
  const normalized = normalizeRouteResult(raw, effectiveThreshold);
  if (normalized && normalized.detectedIntents.length > 0) {
    return done({
      normalized,
      source: "jev",
      strategy: "multi",
      jevAttempted: true,
      fallbackUsed: false,
      fallbackReason: null,
      usage: raw.usage || null,
      complexity,
    });
  }
  // Invalid or empty Jev result: legacy fallback, never a silent "general".
  return done({
    normalized: heuristicRoute(query, context, effectiveThreshold),
    source: "heuristic",
    fallbackReason: normalized ? "jev-empty-decision" : "jev-invalid-response",
    jevAttempted: true,
    complexity,
  });
}
