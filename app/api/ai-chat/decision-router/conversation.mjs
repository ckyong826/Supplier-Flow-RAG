// SF-JEV-006: conversation-aware routing. The router decides WHETHER
// rewriting is needed; the existing rewriteQuery() implementation does it.

import { rewriteQuery } from "../retrieval.mjs";

/**
 * Compact user-turn history for the router state (avoids full-history bloat).
 * @param {any} history chat history array (or anything; non-arrays yield "")
 * @param {number} [maxTurns]
 * @param {number} [maxChars]
 */
export function buildRouterContext(history = [], maxTurns = 3, maxChars = 700) {
  if (!Array.isArray(history)) return "";
  return history
    .filter((turn) => turn?.role === "user" && typeof turn.content === "string")
    .slice(-maxTurns)
    .map((turn) => turn.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-maxChars);
}

/**
 * Resolve the effective retrieval query. Returns
 * { retrievalQuestion, rewritten, rewriteApplied }.
 * @param {string} question
 * @param {any} history
 * @param {any} decisions normalized routing decisions (or null for legacy)
 * @param {any} rewriteMode
 */
export function resolveRetrievalQuery(question, history = [], decisions = null, rewriteMode = null) {
  const mode = String(
    rewriteMode || process.env.QUERY_REWRITE_MODE || "history",
  ).toLowerCase();
  const context = buildRouterContext(history);
  const needsRewrite =
    decisions?.decisions?.follow_up === true ||
    (decisions == null && mode === "history" && context.length > 0);

  if (mode === "none") {
    return { retrievalQuestion: question, rewritten: false, rewriteApplied: false, context };
  }
  if (mode === "history" || mode === "default") {
    if (!needsRewrite && decisions != null) {
      // Router says no follow-up: do not let stale context override the question.
      return { retrievalQuestion: question, rewritten: false, rewriteApplied: false, context };
    }
    const rewritten = rewriteQuery(question, context);
    return {
      retrievalQuestion: rewritten,
      rewritten: rewritten !== question,
      rewriteApplied: true,
      context,
    };
  }
  // "hyde" and concatenative modes are handled by the caller (route.ts);
  // here we only supply the joined base.
  const joined = `${context}\n${question}`.trim();
  return { retrievalQuestion: joined, rewritten: joined !== question, rewriteApplied: true, context };
}
