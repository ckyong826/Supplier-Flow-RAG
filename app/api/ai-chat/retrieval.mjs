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
  return [...new Set([full, ...clauses])].slice(0, 4);
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
