const ignoredTerms = new Set(["about", "after", "also", "and", "are", "can", "for", "from", "have", "how", "i", "is", "it", "me", "need", "of", "or", "please", "some", "the", "this", "to", "what", "with", "would", "you"]);

function termsFor(text) {
  return [...new Set(text.toLowerCase().replace(/sockets/g, "socket").replace(/mcbs/g, "mcb").split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !/^\d+$/.test(word) && !ignoredTerms.has(word)))];
}

function scoreText(text, terms) {
  return terms.reduce((score, term) => score + (text.includes(term) ? (term === "socket" ? 5 : 1) : 0), 0);
}

export function decomposeQuery(text) {
  const full = text.replace(/\s+/g, " ").trim();
  const clauses = full.split(/\n|;|\band\s+also\b|\balso\b/i).map((clause) => clause.trim()).filter(Boolean);
  const lower = full.toLowerCase();
  const hasProductIntent = ["mcb", "rcbo", "rccb", "spd", "surge", "contactor", "breaker", "socket", "sku", "curve", "pole"]
    .some((term) => lower.includes(term));
  const hasPaymentIntent = ["payment", "deposit", "credit terms", "bank transfer"]
    .some((term) => lower.includes(term));
  const hasDeliveryIntent = ["delivery", "shipping", "lead time", "working days"]
    .some((term) => lower.includes(term));
  const hasSalesIntent = ["sales", "quotation", "quote", "follow up", "sop", "out of stock", "unavailable", "equivalent", "alternative"]
    .some((term) => lower.includes(term));
  const policyStart = full.search(/\b(?:payment|delivery|shipping|lead time|working days)\b/i);
  const beforePolicy = policyStart >= 0 ? full.slice(0, policyStart).trim() : full;
  const productQuery = beforePolicy.replace(/\b(?:what|which)\s+product\s+fits\b.*$/i, "").trim() || beforePolicy;
  const intentQueries = [];
  if (hasProductIntent && (hasPaymentIntent || hasDeliveryIntent) && productQuery !== full) intentQueries.push(productQuery);
  if (hasPaymentIntent) intentQueries.push("payment terms");
  if (hasDeliveryIntent) intentQueries.push(/\bkuala\s+lumpur\b/i.test(full) ? "Kuala Lumpur delivery lead time" : "delivery terms lead time");
  if (hasSalesIntent) {
    intentQueries.push(lower.includes("out of stock") || lower.includes("unavailable")
      ? "sales quotation SOP unavailable equivalent alternative"
      : "sales quotation SOP follow up 3 working days");
  }
  return [...new Set([full, ...clauses, ...intentQueries])].slice(0, 6);
}

export function fuseByKeywords(items, queries, textForItem) {
  const scores = new Map();
  for (const query of queries) {
    const terms = termsFor(query);
    const ranked = items.map((item) => ({ item, score: scoreText(textForItem(item).toLowerCase(), terms) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
    ranked.forEach(({ item }, index) => scores.set(item, (scores.get(item) || 0) + 1 / (61 + index)));
  }
  return [...scores.entries()].sort(([, left], [, right]) => right - left).map(([item]) => item);
}

export function fuseByKeywordsWithCoverage(items, queries, textForItem, limit) {
  const selected = [];
  const seen = new Set();
  const add = (item) => {
    if (!item) return;
    const key = textForItem(item);
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(item);
  };

  // The first query is the original question. Reserve one result for each explicit
  // subquery, then use the normal fused ranking to fill remaining context slots.
  queries.slice(1).forEach((query) => add(fuseByKeywords(items, [query], textForItem)[0]));
  fuseByKeywords(items, queries, textForItem).forEach(add);
  return selected.slice(0, limit);
}
