// SF-JEV-003: supported routing labels + decision normalization.
//
// Laya returns calibrated P(true) per label (noul). This module converts raw
// confidences into validated multi-label decisions. Thresholds are
// configurable because the base checkpoints are not calibrated for
// SupplierFlow (see Laya docs); never hardcode 0.8/0.85 as "correct".

export const SUPPORTED_LABELS = [
  "product_lookup",
  "product_discovery",
  "specification",
  "pricing",
  "inventory",
  "supplier",
  "policy",
  "comparison",
  "follow_up",
  "general",
];

// Mirrors decision-router/app.py ROUTING_QUESTIONS. Kept in TS so the eval
// harness and docs can reference the exact questions without importing Python.
export const ROUTING_QUESTIONS = {
  product_lookup: {
    type: "noul",
    instructions: "Does this request require information about one or more specific products?",
  },
  product_discovery: {
    type: "noul",
    instructions: "Is the user searching for a suitable product based on requirements or use case?",
  },
  specification: {
    type: "noul",
    instructions: "Does the user request technical specifications, ratings, or datasheet values?",
  },
  pricing: {
    type: "noul",
    instructions: "Does the user request pricing information such as price, cost, quotation, SST, or charges?",
  },
  inventory: {
    type: "noul",
    instructions: "Does the user request availability, stock, lead time, delivery, or shipping information?",
  },
  supplier: {
    type: "noul",
    instructions: "Does the user request supplier, manufacturer, brand, or sales-team information?",
  },
  policy: {
    type: "noul",
    instructions:
      "Does answering this request require company or product policy information such as payment, warranty, returns, Incoterms, or SOP?",
  },
  comparison: {
    type: "noul",
    instructions: "Does the request compare multiple products or alternatives?",
  },
  follow_up: {
    type: "noul",
    instructions:
      "Does the user refer to previous conversation context with pronouns or phrases like it, this product, the second one, what about, or how about?",
  },
  general: {
    type: "noul",
    instructions: "Is this general conversation (greeting, thanks, RFQ process help) that does not require knowledge retrieval?",
  },
};

export function defaultThreshold() {
  const raw = Number(process.env.DECISION_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
}

/** Normalize a raw /route payload into validated decisions. Returns null when invalid.
 * @param {any} payload
 * @param {number} [threshold]
 * @returns {{ decisions: Record<string, boolean>, confidences: Record<string, number>, detectedIntents: string[], threshold: number, mocked: boolean } | null}
 */
export function normalizeRouteResult(payload, threshold = defaultThreshold()) {
  if (!payload || typeof payload !== "object") return null;
  const { decisions, confidences } = payload;
  if (!decisions || !confidences || typeof decisions !== "object" || typeof confidences !== "object") return null;

  const normalizedDecisions = {};
  const normalizedConfidences = {};
  for (const label of SUPPORTED_LABELS) {
    const conf = confidences[label];
    if (typeof conf !== "number" || !Number.isFinite(conf) || conf < 0 || conf > 1) return null;
    // Strict: every label needs an explicit boolean. A payload with missing
    // labels is invalid and must trigger fallback, never a silent "general".
    if (typeof decisions[label] !== "boolean") return null;
    normalizedDecisions[label] = decisions[label];
    normalizedConfidences[label] = conf;
  }

  const detectedIntents = SUPPORTED_LABELS.filter(
    (label) => label !== "general" && normalizedDecisions[label],
  );

  // "general" alone with other intents is contradictory; drop it.
  if (detectedIntents.length > 0 && normalizedDecisions.general) {
    normalizedDecisions.general = false;
  }

  return {
    decisions: normalizedDecisions,
    confidences: normalizedConfidences,
    detectedIntents,
    threshold,
    mocked: Boolean(payload.mocked),
  };
}

/** A normalized result is usable only when at least one label is present.
 * @param {any} normalized
 */
export function isUsableDecision(normalized) {
  if (!normalized) return false;
  return SUPPORTED_LABELS.some((label) => normalized.decisions[label]);
}
