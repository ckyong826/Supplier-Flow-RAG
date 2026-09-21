// Deterministic TS fallback mirroring decision-router/app.py mock mode.
// Used when Laya is disabled/unreachable AND as the offline eval baseline.
// Keep the two implementations in sync: keyword lists, SKU rule, follow-up rule.
//
// Design notes (all visible, all tunable):
// - SKU candidates need letters+digits (or a plain 5-6 digit article number
//   like Eaton's 263584). Standard numbers (60898-1, 30 days) are excluded.
// - Generic type words (breaker, MCB) route to discovery, not lookup: naming
//   a category is not the same as naming a product.
// - "payment terms" is policy, not pricing. Pricing is price/cost/quote language.

import { SUPPORTED_LABELS } from "./labels.mjs";

const SKU_CANDIDATE = /\b[a-z0-9][a-z0-9./-]{2,}\b/gi;

function isSkuToken(token) {
  const s = token.replace(/[.,;:!?]+$/, "");
  if (s.length < 3) return false;
  const hasDigit = /\d/.test(s);
  const hasLetter = /[a-z]/i.test(s);
  if (!hasDigit) return false;
  if (!hasLetter) return /^\d{5,6}$/.test(s); // plain article numbers only
  if (/^\d/.test(s)) {
    // A leading-digit token is only an identifier when it carries real
    // numeric substance (2CSF202001R1400, 480Y/277) -- not a dimensioned
    // term like 1-pole or a standard number like 60898-1.
    const groups = s.match(/\d+/g) || [];
    return s.length >= 5 && groups.length >= 2;
  }
  if (s.length < 5) return /^[a-z]+\d[\w]*$/i.test(s); // PF7, S200, F200
  return true;
}

/** @param {any} text */
export function extractSkuCandidates(text) {
  const candidates = String(text || "").match(SKU_CANDIDATE) || [];
  const seen = new Set();
  const out = [];
  for (const raw of candidates) {
    const sku = raw.replace(/[.,;:!?]+$/, "");
    if (!isSkuToken(sku)) continue;
    const key = sku.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sku);
  }
  return out;
}

function has(text, pattern) {
  return new RegExp(pattern, "i").test(text);
}

const IS_GREETING = /^\W*(hi|hello|hey|thanks|thank you|terima kasih)\b|^\W*(你好|谢谢)/;
const DISCOVERY_VERB = /\b(find|search|recommend|suggest|need|needs|looking for|tell me about)\b/;

/** @param {any} query @param {any} [history] */
export function heuristicConfidences(query, history = "") {
  const text = `${history} ${query}`.toLowerCase();
  const queryText = String(query || "");
  const historyText = String(history || "");
  const querySkus = extractSkuCandidates(queryText);
  const historySkus = extractSkuCandidates(historyText);

  const explicitFollowUp = /\b(what about|how about|the second|that one|this product|same as)\b/.test(text);
  const pronounFollowUp =
    historyText.trim().length > 0 && /\b(it|that|this|they|them|same)\b/.test(queryText.toLowerCase());
  const isFollowUp = explicitFollowUp || pronounFollowUp;
  const isGreeting = IS_GREETING.test(queryText.trim());
  // A follow-up inherits the referenced product: "How about XYZ?" after a
  // warranty question is a lookup for XYZ, not a generic chat.
  const hasSku = querySkus.length >= 1 || (!isGreeting && isFollowUp && historySkus.length >= 1);
  const multiSku = querySkus.length >= 2;
  const discoveryVerb = DISCOVERY_VERB.test(queryText.toLowerCase());

  // Note: CJK alternatives sit OUTSIDE \b groups -- \b never matches
  // between two CJK characters, so \b保修\b can never fire.
  //
  // History-bleed guard: content labels (spec/discovery/pricing/inventory/
  // supplier/policy) are scored on the query alone when the query carries
  // its own content cues; history is inherited only for bare references
  // ("How about X?"). Otherwise "And what about its warranty?" would inherit
  // "price" from a pricing history (H11).
  const CONTENT_CUES = "\\b(specs?|specifications?|rating|current|voltage|curve|pole|breaking capacity|ka\\b|residual|coil|datasheet|difference|find|search|recommend|suggest|show|need|suitable|outdoor|waterproof|looking for|tell me about|options|price|pricing|cost|cheap|quotation|quote|sst|charge|credit|discount|stock|availability|available|lead time|deliver|delivery|shipping|working days|supplier|manufacturer|brand|polic|payment|warranty|return|refund|incoterms|validity|deposit|sop)\\b|规格|参数|额定|电流|电压|需要|寻找|推荐|价格|费用|库存|现货|交货|发货|保修|退货";
  const queryHasContent = new RegExp(CONTENT_CUES, "i").test(queryText);
  const scope = queryHasContent ? queryText.toLowerCase() : text;
  let specification = has(scope, "\\b(specs?|specifications?|rating|current|voltage|curve|pole|breaking capacity|ka\\b|residual|coil|datasheet|difference)\\b|规格|参数|额定|电流|电压")
    ? 0.9
    : 0.1;
  if (discoveryVerb && querySkus.length === 0) {
    // "Find me a 40A MCB" states constraints, not a spec question.
    specification = 0.1;
  }

  const conf = {
    product_lookup: hasSku
      ? 0.9
      : has(text, "\\b(sku|article|part number|datasheet|product)\\b")
        ? 0.9
        : 0.1,
    product_discovery: has(scope, "\\b(find|search|recommend|suggest|show|need|suitable|outdoor|waterproof|which.*fit|looking for|tell me about|options|cari|sesuai)\\b|需要|寻找|推荐") ? 0.9 : 0.1,
    specification,
    pricing: has(scope, "\\b(price|pricing|cost|cheap|cheaper|cheapest|expensive|quotation|quote|sst|charge|credit|discount|harga)\\b|价格|费用") ? 0.9 : 0.1,
    inventory: has(scope, "\\b(stock|availability|available|lead time|deliver|delivery|shipping|working days|stok|tersedia|penghantaran)\\b|库存|现货|交货|发货") ? 0.9 : 0.1,
    supplier: has(scope, "\\b(supplier|manufacturer|brand|schneider|abb|eaton|sales team)\\b") ? 0.9 : 0.1,
    policy: has(scope, "\\b(polic|payment|warranty|return|returned|refund|incoterms|validity|deposit|sop)\\b|保修|退货") ? 0.9 : 0.1,
    comparison:
      multiSku || /\b(compare|comparison|versus|vs\.?|cheaper|better|difference)\b/.test(text) ? 0.9 : 0.1,
    follow_up: isFollowUp ? 0.9 : 0.1,
    general: IS_GREETING.test(text.trim()) ? 0.9 : 0.1,
  };
  const out = {};
  for (const label of SUPPORTED_LABELS) out[label] = conf[label] ?? 0.1;
  return out;
}

/**
 * @param {any} query
 * @param {any} [history]
 * @param {number} [threshold]
 * @returns {{ decisions: Record<string, boolean>, confidences: Record<string, number>, detectedIntents: string[], threshold: number, mocked: boolean }}
 */
export function heuristicRoute(query, history = "", threshold = 0.5) {
  const confidences = heuristicConfidences(query, history);
  const decisions = {};
  for (const label of SUPPORTED_LABELS) decisions[label] = confidences[label] >= threshold;
  if (decisions.general && Object.keys(decisions).some((l) => l !== "general" && decisions[l])) {
    decisions.general = false;
  }
  return {
    decisions,
    confidences,
    detectedIntents: SUPPORTED_LABELS.filter((l) => l !== "general" && decisions[l]),
    threshold,
    mocked: true,
  };
}
