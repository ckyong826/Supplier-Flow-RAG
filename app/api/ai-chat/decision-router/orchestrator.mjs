// Experiment phase 1: concurrent multi-query execution + request-level
// global evidence selection.
//
// Independent operations run via Promise.allSettled; one failure never
// discards the others. Selection then enforces ONE global budget over the
// merged pool: dedupe, relevance rerank, global top-k, token budget,
// per-product pinning for comparisons. Extra operations must not grow the
// final context automatically (N04/N17 over-retrieval).

import { decomposeQuery, rerankByCoverage } from "../retrieval.mjs";
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
    limit: operation.limit || limit,
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

/**
 * Dedupe chunks by content, preserving first-seen order + provenance.
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

function mentionsSku(chunk, sku) {
  const text = `${chunk?.title || ""} ${chunk?.content || ""}`.toUpperCase();
  return text.includes(String(sku).toUpperCase());
}

/**
 * Request-level global evidence selection over the merged pool.
 *
 * @param {any} plan
 * @param {any} settled
 * @param {{ question?: string, queries?: string[], globalTopK?: number, tokenBudgetChars?: number }} [options]
 */
export function aggregateEvidence(plan, settled, { question = "", queries = [], globalTopK = 5, tokenBudgetChars = 12000 } = {}) {
  const documents = [];
  const products = new Map();
  const failedOperations = [];
  const missingInformation = [];

  (plan?.operations || []).forEach((operation, index) => {
    const result = settled[index];
    if (!result || result.status !== "fulfilled") {
      failedOperations.push(operation?.type || `op-${index}`);
      missingInformation.push(operation?.type || `op-${index}`);
      return;
    }
    const value = result.value;
    for (const chunk of value?.chunks || []) documents.push(chunk);
    for (const product of value?.products || []) {
      if (product?.sku && !products.has(product.sku)) products.set(product.sku, product);
    }
  });

  const deduped = dedupeChunks(documents);

  // Relevance rerank across the merged pool with the ORIGINAL question first,
  // so extra ops cannot smuggle irrelevant chunks to the top.
  const ranked = deduped.length > 1 && (question || queries.length)
    ? rerankByCoverage(deduped, [question, ...queries].filter(Boolean), (chunk) => chunk.content, deduped.length)
    : deduped;

  // Per-product pinning for comparisons: each requested SKU keeps its best
  // chunk; remaining slots fill by rank. Product B must never be dropped.
  const requestedSkus = [
    ...new Set((plan?.operations || []).flatMap((op) => op?.productIds || [])),
  ];
  let selected;
  if (requestedSkus.length >= 2 && ranked.length > 0) {
    const pinned = [];
    const pinnedKeys = new Set();
    for (const sku of requestedSkus) {
      const best = ranked.find((chunk) => !pinnedKeys.has(chunk.content) && mentionsSku(chunk, sku));
      if (best) {
        pinned.push(best);
        pinnedKeys.add(best.content);
      }
    }
    selected = [...pinned];
    for (const chunk of ranked) {
      if (selected.length >= Math.max(globalTopK, pinned.length)) break;
      if (!pinnedKeys.has(chunk.content)) {
        selected.push(chunk);
        pinnedKeys.add(chunk.content);
      }
    }
  } else {
    selected = ranked.slice(0, Math.max(globalTopK, 0));
  }

  // Token budget: truncate tail, never drop leading docs first.
  let used = 0;
  const budgeted = [];
  for (const chunk of selected) {
    const size = (chunk?.content || "").length;
    if (used + size > tokenBudgetChars && budgeted.length > 0) break;
    budgeted.push(chunk);
    used += size;
  }

  // Missing information is computed AFTER selection: never claim evidence
  // that the budget removed, and never hide a failed operation.
  const keptKeys = new Set(budgeted.map((chunk) => chunk.content));
  const droppedOps = new Set();
  (plan?.operations || []).forEach((operation, index) => {
    const result = settled[index];
    if (!result || result.status !== "fulfilled") return;
    const chunks = result.value?.chunks || [];
    if (chunks.length > 0 && !chunks.some((chunk) => keptKeys.has(chunk.content))) {
      droppedOps.add(operation?.type || `op-${index}`);
    }
  });
  for (const op of droppedOps) missingInformation.push(`dropped:${op}`);
  for (const sku of requestedSkus) {
    const coveredByProduct = [...products.keys()].some(
      (key) => String(key).toUpperCase() === String(sku).toUpperCase(),
    );
    const coveredByChunk = budgeted.some((chunk) => mentionsSku(chunk, sku));
    if (!coveredByProduct && !coveredByChunk) {
      missingInformation.push(`evidence:${sku}`);
    }
  }

  const completedOperations = [];
  (plan?.operations || []).forEach((operation, index) => {
    const result = settled[index];
    if (!result || result.status !== "fulfilled") return;
    const chunks = result.value?.chunks || [];
    const productsOut = result.value?.products || [];
    if (chunks.some((chunk) => keptKeys.has(chunk.content)) || productsOut.length > 0) {
      completedOperations.push(operation?.type || `op-${index}`);
    }
  });

  return {
    documents: budgeted,
    products: [...products.keys()],
    productDetails: [...products.values()],
    completedOperations,
    failedOperations,
    droppedOperations: [...droppedOps],
    missingInformation: [...new Set(missingInformation)],
  };
}
