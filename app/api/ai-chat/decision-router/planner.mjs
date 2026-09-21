// Experiment phases 1+3: two-stage intent -> requirements -> operations.
//
// Stage 1 identifies information requirements (not operations).
// Stage 2 chooses retrieval operations from intents + validated product
// identifiers + catalogue coverage + required document types.
//
// Hard rules from the benchmark analysis:
// - Exact-product ops never stand alone: a keyword op on the resolved query
//   always accompanies them (D66/A38/A43/A44 retrieved zero chunks from
//   exact-only plans). Technical questions stay eligible for knowledge.
// - Intent ops carry the focused retrieval query, never a generic hint blob
//   ("policy payment warranty returns Incoterms SOP" polluted N04/N17).
// - Duplicate (type, query) operations are removed.
// - Unknown SKUs get an exact attempt (honest naming) plus keyword retrieval;
//   fuzzy catalogue matches must not substitute for them (enforced by the
//   caller, which drops fuzzy matches when nothing validated).

/**
 * @typedef {{ type: string, query: string, productIds?: string[], priority: number, limit?: number }} RetrievalOperation
 * @typedef {{ requiresRetrieval: boolean, operations: RetrievalOperation[], requiresQueryRewrite: boolean, requiresConversationContext: boolean, detectedIntents: string[], requirements: string[] }} RetrievalPlan
 */

const KNOWLEDGE_INTENTS = ["policy", "supplier", "pricing", "inventory"];

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
  const requirements = [];

  // General conversation: no retrieval at all.
  if (decisions.general && detectedIntents.length === 0) {
    return {
      requiresRetrieval: false,
      operations: [],
      requiresQueryRewrite: false,
      requiresConversationContext: false,
      detectedIntents,
      requirements,
    };
  }

  const validatedIds = Array.isArray(productIds) ? productIds.slice(0, 6) : [];
  const unknownIds = (Array.isArray(unknownSkus) ? unknownSkus : []).filter(
    (sku) => !validatedIds.includes(sku),
  ).slice(0, 3);

  // ---- Stage 1: requirements -------------------------------------------
  if (validatedIds.length || unknownIds.length || decisions.product_lookup) {
    requirements.push("exact-product");
  }
  if (
    decisions.product_discovery ||
    decisions.specification ||
    decisions.comparison ||
    decisions.policy ||
    decisions.supplier ||
    decisions.pricing ||
    decisions.inventory ||
    detectedIntents.length === 0
  ) {
    requirements.push("knowledge");
  }
  for (const intent of KNOWLEDGE_INTENTS) {
    if (decisions[intent]) requirements.push(`focus:${intent}`);
  }

  // ---- Stage 2: operations ----------------------------------------------
  /** @type {RetrievalOperation[]} */
  const operations = [];
  const seen = new Set();
  const push = (op) => {
    const key = `${op.type}::${(op.query || "").trim().toLowerCase()}::${(op.productIds || []).join(",")}`;
    if (seen.has(key)) return;
    if (!op?.query?.trim() && (!op?.productIds || !op.productIds.length)) return;
    seen.add(key);
    operations.push({ priority: 100, ...op });
  };

  // Exact lookups first (highest priority, deterministic).
  for (const sku of validatedIds) {
    push({ type: "exact_product", query: sku, productIds: [sku], priority: 10 });
  }
  for (const sku of unknownIds) {
    push({ type: "exact_product", query: sku, productIds: [sku], priority: 11 });
  }

  if (requirements.includes("knowledge")) {
    if (decisions.comparison && validatedIds.length >= 2) {
      // One knowledge op per product so the merge cannot drop a side.
      for (const sku of validatedIds) {
        push({ type: "hybrid", query: `${baseQuery} ${sku}`.trim(), productIds: [sku], priority: 20 });
      }
    } else if (decisions.product_discovery) {
      push({ type: "hybrid", query: baseQuery, priority: 20 });
    } else {
      push({ type: "keyword", query: baseQuery, priority: 21 });
    }
    // Focused intent ops: same resolved query (no generic hint blob), small
    // per-op limit; the global evidence stage caps the total.
    for (const intent of KNOWLEDGE_INTENTS) {
      if (!decisions[intent]) continue;
      push({ type: intent, query: baseQuery, priority: 30, limit: 3 });
    }
  } else if (requirements.includes("exact-product")) {
    // Safety net: never run exact ops alone. Catalogue facts cannot answer
    // technical questions (D66/A38/A43/A44 retrieved zero chunks from
    // exact-only plans); the global selection stage keeps the extra context
    // bounded.
    push({ type: "keyword", query: baseQuery, priority: 21 });
  }

  // Nothing actionable: preserve legacy behaviour with a single keyword op
  // instead of inventing a classification.
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
    requirements,
  };
}
