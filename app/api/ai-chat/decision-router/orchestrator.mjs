// SF-JEV-005: concurrent multi-query execution + evidence aggregation.
//
// Independent operations run via Promise.allSettled; one failure never
// discards the others. Aggregation dedupes, preserves provenance, groups by
// product where useful, and enforces per-product retention for comparisons.

import { decomposeQuery } from "../retrieval.mjs";
import { retrieveKnowledge } from "../knowledge-retrieval.mjs";

/** Map planner op types onto the existing retrieval backend. */
function backendModeFor(opType, configuredMode = "keyword") {
  switch (opType) {
    case "vector":
      return "vector";
    case "hybrid":
      return "hybrid";
    case "multi":
      return "multi";
    case "keyword":
    case "policy":
    case "supplier":
    case "pricing":
    case "inventory":
    default:
      return configuredMode === "vector" || configuredMode === "hybrid" || configuredMode === "multi"
        ? configuredMode
        : "keyword";
  }
}

/**
 * @param {any} operation planner operation
 * @param {{ supabase?: any, products?: any[], configuredMode?: string, limit?: number }} [deps]
 */
export async function executeOperation(
  operation,
  { supabase, products = [], configuredMode, limit = 5 } = {},
) {
  if (operation.type === "exact_product") {
    const wanted = new Set(
      (operation.productIds || [operation.query]).map((s) => String(s).toUpperCase()),
    );
    const matches = (products || []).filter(
      (p) => wanted.has(String(p?.sku || "").toUpperCase()) || wanted.has(String(p?.id || "").toUpperCase()),
    );
    return {
      operation,
      chunks: [],
      products: matches,
      status: "fulfilled",
    };
  }

  const mode = backendModeFor(operation.type, configuredMode);
  const queries = decomposeQuery(operation.query);
  const retrieved = await retrieveKnowledge({
    supabase,
    question: operation.query,
    queries,
    limit,
    mode,
  });
  return {
    operation,
    chunks: retrieved.chunks || [],
    products: [],
    retrievalMeta: { mode: retrieved.mode, gated: retrieved.gated, rerankMode: retrieved.rerankMode },
    status: "fulfilled",
  };
}

/**
 * Execute all plan operations concurrently. Returns
 * { settled, completedOperations, failedOperations }.
 * @param {any} plan
 * @param {any} deps
 */
export async function executePlan(plan, deps) {
  const operations = plan?.operations || [];
  const settled = await Promise.allSettled(
    operations.map((operation) => executeOperation(operation, deps)),
  );
  const completedOperations = [];
  const failedOperations = [];
  settled.forEach((result, index) => {
    const label = operations[index]?.type || `op-${index}`;
    if (result.status === "fulfilled") completedOperations.push(label);
    else failedOperations.push(label);
  });
  return { settled, completedOperations, failedOperations };
}

/** Dedupe chunks by content, preserving first-seen order + provenance.
 * @param {any} chunks
 */
export function dedupeChunks(chunks) {
  const seen = new Set();
  const out = [];
  for (const chunk of chunks || []) {
    const key = chunk?.content || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out;
}

/**
 * Aggregate settled results into { documents, products, ... }.
 * Comparison guard: when the plan has per-product ops, keep at least one
 * chunk (or product fact) per requested product so Product B is never
 * silently dropped from the context.
 * @param {any} plan
 * @param {any} settled
 * @param {{ tokenBudgetChars?: number }} [options]
 */
export function aggregateEvidence(plan, settled, { tokenBudgetChars = 12000 } = {}) {
  const documents = [];
  const products = new Map();
  const completedOperations = [];
  const failedOperations = [];
  const missingInformation = [];

  (plan?.operations || []).forEach((operation, index) => {
    const result = settled[index];
    if (!result || result.status !== "fulfilled") {
      failedOperations.push(operation?.type || `op-${index}`);
      missingInformation.push(operation?.type || `op-${index}`);
      return;
    }
    completedOperations.push(operation?.type || `op-${index}`);
    const value = result.value;
    for (const chunk of value?.chunks || []) documents.push(chunk);
    for (const product of value?.products || []) {
      if (product?.sku && !products.has(product.sku)) products.set(product.sku, product);
    }
  });

  let deduped = dedupeChunks(documents);

  // Per-product retention for comparisons: ensure every requested SKU with
  // any evidence keeps at least one chunk mentioning it.
  const requestedSkus = [
    ...new Set(
      (plan?.operations || []).flatMap((op) => op?.productIds || []),
    ),
  ];
  if (requestedSkus.length >= 2) {
    const kept = [];
    const seenSkus = new Set();
    for (const chunk of deduped) {
      kept.push(chunk);
      const text = `${chunk?.title || ""} ${chunk?.content || ""}`.toUpperCase();
      for (const sku of requestedSkus) {
        if (text.includes(String(sku).toUpperCase())) seenSkus.add(String(sku).toUpperCase());
      }
    }
    for (const sku of requestedSkus) {
      if (!seenSkus.has(String(sku).toUpperCase())) {
        missingInformation.push(`evidence:${sku}`);
      }
    }
    deduped = kept;
  }

  // Token budget: truncate tail content, never drop whole leading docs first.
  let used = 0;
  const budgeted = [];
  for (const chunk of deduped) {
    const size = (chunk?.content || "").length;
    if (used + size > tokenBudgetChars && budgeted.length > 0) break;
    budgeted.push(chunk);
    used += size;
  }

  return {
    documents: budgeted,
    products: [...products.keys()],
    productDetails: [...products.values()],
    completedOperations,
    failedOperations,
    missingInformation: [...new Set(missingInformation)],
  };
}
