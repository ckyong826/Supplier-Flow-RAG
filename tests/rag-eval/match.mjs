// Shared text matcher for the RAG eval, used by the verifier and both runners so that
// offline and live scoring can never drift apart.
//
// Design notes:
// - punctuation is flattened to spaces, so "Residual-current type: AC" and "type AC" match
// - matching is token-boundary aware, so "type A" does NOT match inside "type AC",
//   and "40" does NOT match inside "400". This matters because most of the near-duplicate
//   SKU traps in this suite turn on exactly that distinction.

export function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9.%/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True when `needle` occurs in `haystack` as a whole token sequence.
// A needle may list alternatives separated by "|" - any one of them matching is a pass.
// Use this for facts a correct answer could word several ways ("photographs" / "photos"),
// never to paper over a genuinely wrong value.
export function contains(haystack, needle) {
  const hay = normalise(haystack);
  return String(needle)
    .split("|")
    .map((alternative) => normalise(alternative))
    .filter(Boolean)
    .some((target) => new RegExp(`(?<![a-z0-9])${escapeRegex(target)}(?![a-z0-9])`, "i").test(hay));
}

export function matchesAny(text, patterns = []) {
  return patterns.filter((pattern) => new RegExp(pattern, "i").test(text));
}

// Heuristic abstention detector for negative questions. Deliberately generous about
// phrasing but strict about the absence of a committed value: the guards in
// must_not_contain / must_not_match are what actually catch fabrication.
const ABSTAIN_SIGNALS = [
  "don't have", "do not have", "not have that", "no information", "not listed",
  "isn't listed", "is not listed", "not specified", "isn't specified", "is not specified",
  "not stated", "isn't stated", "not available in", "cannot confirm", "can't confirm",
  "unable to confirm", "not something i can confirm", "our team will confirm",
  "sales team", "request a quotation", "submit an rfq", "not in our", "could not find",
  "couldn't find", "no exact", "not covered", "does not cover", "doesn't cover",
  "check the product listing", "confirmed by our", "i'd need to check", "would need to check"
];

export function looksLikeAbstention(answer) {
  const text = normalise(answer);
  return ABSTAIN_SIGNALS.some((signal) => text.includes(normalise(signal)));
}
