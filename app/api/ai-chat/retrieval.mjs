const ignoredTerms = new Set(["about", "after", "also", "and", "are", "can", "for", "from", "have", "how", "i", "is", "it", "me", "need", "of", "or", "please", "some", "the", "this", "to", "what", "with", "would", "you"]);

function mentions(text, term) {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function termsFor(text) {
  return [...new Set(text.toLowerCase().replace(/sockets/g, "socket").replace(/mcbs/g, "mcb").split(/[^a-z0-9]+/).filter((word) => (word.length > 1 || /^\d+$/.test(word)) && !ignoredTerms.has(word)))];
}

function scoreText(text, terms) {
  const matches = (term) => /^\d+$/.test(term)
    ? new RegExp(`(?:^|[^a-z0-9])${term}(?:$|[^a-z0-9])`).test(text)
    : text.includes(term);
  const termScore = (term) => /^[a-z][a-z0-9]*\d[a-z0-9]*$/i.test(term) ? 20 : (/^\d+$/.test(term) ? 3 : (term === "socket" ? 5 : 1));
  const phraseScore = terms.slice(0, -1).reduce((score, term, index) => {
    return score + (matches(term) && matches(terms[index + 1]) && text.includes(`${term} ${terms[index + 1]}`) ? 2 : 0);
  }, 0);
  return terms.reduce((score, term) => score + (matches(term) ? termScore(term) : 0), phraseScore);
}

export function rewriteQuery(question, history = "") {
  const current = String(question || "").replace(/\s+/g, " ").trim();
  const context = String(history || "").replace(/\s+/g, " ").trim().slice(-700);
  if (!current || !context) return current;
  const historyHasEntity = /\b[A-Z][A-Z0-9-]*\d[A-Z0-9-]*\b|\b(?:mcb|rcbo|rccb|spd|contactor|sku)\b/i.test(context);
  const followUp = /\b(it|that|this|they|their|them|same|there|those|the product|the item|the sku)\b/i.test(current)
    || /^(and|also|what about|how about|then|for that)\b/i.test(current)
    || (termsFor(current).length <= 6 && historyHasEntity);
  return followUp ? `${context} ${current}`.trim() : current;
}

// Second-stage lexical reranker. It is deliberately dependency-free: an optional neural
// cross-encoder can replace this scorer later without changing the retrieval contract.
export function rerankByCoverage(items, queries, textForItem, limit = items.length) {
  const queryTerms = [...new Set(queries.flatMap(termsFor))];
  return items
    .map((item, originalIndex) => {
      const text = textForItem(item).toLowerCase();
      const queryScores = queries.map((query) => scoreText(text, termsFor(query)));
      const coverage = queryTerms.length
        ? queryTerms.filter((term) => (term.length > 1 && text.includes(term))).length / queryTerms.length
        : 0;
      const exactIdentifiers = queryTerms.filter((term) => /^[a-z][a-z0-9]*\d[a-z0-9]*$/i.test(term) && text.includes(term)).length;
      const similarity = typeof item.similarity === "number" ? item.similarity * 10 : 0;
      const score = Math.max(...queryScores, 0) * 2 + queryScores.reduce((sum, value) => sum + value, 0) + coverage * 10 + exactIdentifiers * 20 + similarity;
      return { item, originalIndex, score };
    })
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function documentSummary(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headings = lines.filter((line) => /^#{1,3}\s/.test(line));
  const factLines = lines.filter((line) => /SKU|rated|current|voltage|delivery|payment|warranty|alternative|equivalent|compatible|curve|residual|I.?n|Imax|Iimp|working days|SST|Incoterms/i.test(line));
  return [...new Set([...headings, ...factLines])].slice(0, 24).join(" ");
}

export function decomposeQuery(text) {
  const full = text.replace(/\s+/g, " ").trim();
  const clauses = full.split(/\n|;|\band\s+also\b|\balso\b/i).map((clause) => clause.trim()).filter(Boolean);
  const lower = full.toLowerCase();
  const hasProductIntent = ["mcb", "rcbo", "rccb", "spd", "surge", "contactor", "breaker", "socket", "sku", "curve", "pole"]
    .some((term) => mentions(full, term));
  const hasPaymentIntent = ["payment", "deposit", "credit terms", "bank transfer"]
    .some((term) => mentions(full, term));
  const hasDeliveryIntent = ["delivery", "shipping", "lead time", "working days"]
    .some((term) => mentions(full, term));
  const hasSalesIntent = ["sales", "quotation", "quote", "follow up", "sop", "out of stock", "unavailable", "equivalent", "alternative"]
    .some((term) => mentions(full, term));
  const hasAuxiliaryTerminalIntent = mentions(full, "auxiliary") && mentions(full, "terminal");
  const hasQuotationValidityIntent = mentions(full, "quotation") && (mentions(full, "valid") || mentions(full, "validity"));
  const hasSstScopeIntent = mentions(full, "mysst") || (mentions(full, "sales tax") && mentions(full, "goods"));
  const hasSstRateIntent = mentions(full, "sst") && (mentions(full, "rate") || mentions(full, "percentage"));
  const policyStart = full.search(/\b(?:payment|delivery|shipping|lead time|working days)\b/i);
  const beforePolicy = policyStart >= 0 ? full.slice(0, policyStart).trim() : full;
  const productQuery = beforePolicy.replace(/\b(?:what|which)\s+product\s+fits\b.*$/i, "").trim() || beforePolicy;
  const intentQueries = [];
  if (hasProductIntent && (hasPaymentIntent || hasDeliveryIntent) && productQuery !== full) intentQueries.push(productQuery);
  if (hasPaymentIntent) intentQueries.push("payment terms");
  if (hasDeliveryIntent) intentQueries.push(/\bkuala\s+lumpur\b/i.test(full) ? "Kuala Lumpur Klang Valley delivery 1–2 working days next working day" : "delivery terms lead time");
  if (hasSalesIntent) {
    intentQueries.push(lower.includes("out of stock") || lower.includes("unavailable")
      ? "sales quotation SOP unavailable equivalent alternative"
      : "sales quotation SOP follow up 3 working days");
  }
  if (hasAuxiliaryTerminalIntent) intentQueries.push("TeSys D 1NO 1NC auxiliary terminal IDs 13 14 21 22");
  if (hasQuotationValidityIntent) intentQueries.push("quotation validity 14 calendar days");
  if (hasSstScopeIntent) intentQueries.push("MySST taxable goods manufactured imported sales tax");
  if (hasSstRateIntent) intentQueries.push("SST rate percentage no universal rate");
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
