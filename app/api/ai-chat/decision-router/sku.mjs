// SF-JEV: deterministic SKU preprocessing. Candidates are validated against
// the live product catalogue; arbitrary uppercase words never count as SKUs.

import { extractSkuCandidates } from "./heuristic.mjs";

/** Validate raw SKU candidates against known products (by SKU or id).
 * @param {any} candidates
 * @param {any} products
 */
export function validateSkus(candidates, products) {
  const bySku = new Map();
  const byId = new Map();
  for (const product of products || []) {
    if (product?.sku) bySku.set(String(product.sku).toUpperCase(), product);
    if (product?.id) byId.set(String(product.id).toUpperCase(), product);
  }
  const matched = [];
  const unknown = [];
  for (const candidate of candidates || []) {
    const key = String(candidate).toUpperCase();
    const product = bySku.get(key) || byId.get(key);
    if (product) matched.push({ sku: product.sku, id: product.id, product });
    else unknown.push(candidate);
  }
  return { matched, unknown };
}

/**
 * Extract candidate identifiers from the query and validate them.
 * Returns { candidates, productIds, matched, unknown }.
 * @param {any} query
 * @param {any} products
 * @returns {{ candidates: string[], productIds: string[], matched: Array<{ sku: string, id: string, product: any }>, unknown: string[] }}
 */
export function extractAndValidateSkus(query, products) {
  const candidates = extractSkuCandidates(query);
  const { matched, unknown } = validateSkus(candidates, products);
  return {
    candidates,
    productIds: matched.map((m) => m.sku),
    matched,
    unknown,
  };
}
