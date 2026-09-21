// SF-JEV-004: translate routing decisions into executable retrieval ops.
//
// The planner decides HOW to obtain information; it never invents data
// sources. Operation types map onto existing backends:
//   exact_product -> products table lookup (deterministic, never vector)
//   keyword/vector/hybrid/multi -> retrieveKnowledge() with that mode
//   policy/supplier/pricing/inventory -> retrieveKnowledge() with an
//     intent-biased query plus the catalogue facts already in the prompt.
//
// No dedicated pricing/inventory/supplier/policy tables are assumed.

/**
 * @typedef {{ type: string, query: string, productIds?: string[], priority: number }} RetrievalOperation
 * @typedef {{ requiresRetrieval: boolean, operations: RetrievalOperation[], requiresQueryRewrite: boolean, requiresConversationContext: boolean, detectedIntents: string[] }} RetrievalPlan
 */

const POLICY_QUERY_HINTS = {
  policy: "policy payment warranty returns Incoterms SOP",
  supplier: "supplier manufacturer brand sales quotation SOP",
  pricing: "quotation price payment terms",
  inventory: "delivery lead time stock availability",
};

/**
 * @param {any} normalized normalized routing decisions (or null/undefined)
 * @param {{ query?: string, retrievalQuestion?: string, productIds?: string[], unknownSkus?: string[] }} [input]
 */
export function buildRetrievalPlan(
  normalized,
  { query, retrievalQuestion, productIds = [], unknownSkus = [] } = {},
) {
  const decisions = normalized?.decisions || {};
  const detectedIntents = normalized?.detectedIntents || [];
  const baseQuery = retrievalQuestion || query || "";

  // General conversation: no retrieval at all.
  if (decisions.general && detectedIntents.length === 0) {
    return {
      requiresRetrieval: false,
      operations: [],
      requiresQueryRewrite: false,
      requiresConversationContext: false,
      detectedIntents,
    };
  }

  /** @type {RetrievalOperation[]} */
  const operations = [];
  const push = (op) => {
    if (!op?.query?.trim() && (!op?.productIds || !op.productIds.length)) return;
    operations.push({ priority: 100, ...op });
  };

  // 1. Exact product lookups first (highest priority, deterministic).
  const validatedIds = Array.isArray(productIds) ? productIds.slice(0, 6) : [];
  for (const sku of validatedIds) {
    push({ type: "exact_product", query: sku, productIds: [sku], priority: 10 });
  }
  // Unknown SKUs still get one exact attempt so the answer can name the
  // missing identifier honestly instead of semantically matching a neighbour.
  for (const sku of (Array.isArray(unknownSkus) ? unknownSkus : []).slice(0, 3)) {
    if (validatedIds.includes(sku)) continue;
    push({ type: "exact_product", query: sku, productIds: [sku], priority: 11 });
  }

  const wantsKnowledge =
    decisions.product_discovery ||
    decisions.specification ||
    decisions.policy ||
    decisions.supplier ||
    decisions.pricing ||
    decisions.inventory ||
    decisions.comparison ||
    (!decisions.product_lookup && detectedIntents.length === 0);

  if (wantsKnowledge) {
    // Comparison with >=2 known SKUs: one knowledge op per product so the
    // merge step cannot drop a side (see orchestrator pinning).
    if (decisions.comparison && validatedIds.length >= 2) {
      for (const sku of validatedIds) {
        push({ type: "hybrid", query: `${baseQuery} ${sku}`.trim(), productIds: [sku], priority: 20 });
      }
    } else if (decisions.product_discovery) {
      push({ type: "hybrid", query: baseQuery, priority: 20 });
    } else {
      push({ type: "keyword", query: baseQuery, priority: 20 });
    }

    // Intent-biased supplement ops: reuse the knowledge backend with a
    // focused query rather than a separate data source.
    for (const intent of ["policy", "supplier", "pricing", "inventory"]) {
      if (!decisions[intent]) continue;
      // Skip when the base query already covers it via the product ops.
      const hint = POLICY_QUERY_HINTS[intent];
      const focused = `${baseQuery} ${hint}`.trim();
      if (focused === baseQuery) continue;
      push({ type: intent, query: focused, priority: 30 });
    }
  }

  // Nothing actionable (e.g. empty decisions): preserve legacy behaviour with
  // a single keyword op instead of inventing a classification.
  if (operations.length === 0) {
    push({ type: "keyword", query: baseQuery, priority: 20 });
  }

  operations.sort((a, b) => a.priority - b.priority);

  return {
    requiresRetrieval: operations.length > 0,
    operations: operations.slice(0, 6),
    requiresQueryRewrite: decisions.follow_up === true,
    requiresConversationContext: decisions.follow_up === true,
    detectedIntents,
  };
}
