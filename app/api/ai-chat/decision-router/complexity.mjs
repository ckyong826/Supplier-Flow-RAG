// Phase 2: selective Jev routing -- complexity gate.
//
// Jev must not be called for every question. This module implements the
// explicit policy that decides whether a question is a *complex-query
// candidate* (Jev multi-intent analysis may help) or *simple* (legacy RAG).
//
// The policy is deterministic and unit-tested. It keys on countable signals
// (validated SKU count, comparison structure, distinct information-category
// cues) -- never on sentence count or message length alone. A long,
// single-intent technical question stays simple; a short two-SKU comparison
// is complex.
//
// Simple (legacy RAG, no Jev call):
//   "What is A9F73140?" / "What is the return policy?" / "What is an RCCB?"
// Complex (Jev candidate):
//   two-SKU comparisons, product + terms multi-intent, discovery with
//   technical constraints, suitable-product + requirements questions.

import { extractSkuCandidates } from "./heuristic.mjs";

const COMPARISON_WORDS = /\b(compare|comparison|versus|\bvs\b|difference between|which one|which is (cheaper|better))\b/i;
const DISCOVERY_WORDS = /\b(find|search|recommend|suggest|looking for|suitable|which .* fits|what .* fits)\b/i;
const SPEC_WORDS = /\b(spec|rating|current|voltage|curve|pole|breaking capacity|residual|coil|datasheet|installation|compatible|selectivity|derating|kW\b)\b/i;
const POLICY_WORDS = /\b(warranty|return|refund|payment|incoterms|validity|deposit|sop|polic)\b/i;
const PRICING_WORDS = /\b(price|cost|cheap|cheaper|quotation|quote|sst|charge)\b/i;
const INVENTORY_WORDS = /\b(stock|availability|available|lead time|delivery|shipping|working days)\b/i;

/**
 * @param {{ query?: any, history?: any, productIds?: string[], unknownSkus?: string[] }} [input]
 * @returns {{ complex: boolean, reasons: string[] }}
 */
export function isComplexCandidate({ query, history = "", productIds = [], unknownSkus = [] } = {}) {
  const text = `${history} ${query}`;
  const queryText = String(query || "");
  const reasons = [];

  const validatedCount = Array.isArray(productIds) ? productIds.length : 0;
  const unknownCount = Array.isArray(unknownSkus) ? unknownSkus.length : 0;
  const candidateCount = extractSkuCandidates(queryText).length;

  // Two or more product references: a single retrieval rarely covers both.
  if (validatedCount >= 2 || candidateCount >= 2) {
    reasons.push("multi-sku");
  }
  // Explicit comparison against at least one product reference.
  if (COMPARISON_WORDS.test(queryText) && (validatedCount >= 1 || candidateCount >= 1)) {
    reasons.push("comparison-with-product");
  }
  // Multi-intent: product question plus terms from two or more information
  // categories (e.g. product + payment + delivery).
  const categories = [
    POLICY_WORDS.test(text),
    PRICING_WORDS.test(text),
    INVENTORY_WORDS.test(text),
  ].filter(Boolean).length;
  const hasProductCue = validatedCount >= 1 || candidateCount >= 1 || /\b(product|mcb|rcbo|rccb|spd|contactor|breaker)\b/i.test(queryText);
  if (hasProductCue && categories >= 2) {
    reasons.push("multi-intent-terms");
  }
  // Discovery with technical constraints: finding the product AND explaining
  // constraints needs catalogue lookup plus reference knowledge.
  if (DISCOVERY_WORDS.test(queryText) && SPEC_WORDS.test(queryText)) {
    reasons.push("discovery-with-constraints");
  }
  // Unknown identifiers still need knowledge retrieval planning, not just an
  // exact-match attempt (D66/A38 class).
  if (unknownCount >= 1 && SPEC_WORDS.test(queryText)) {
    reasons.push("unknown-sku-with-specs");
  }

  return { complex: reasons.length > 0, reasons: [...new Set(reasons)] };
}
