// Hosted TypeSafe Jev decision provider (official @typesafe-ai/sdk).
//
// Jev is a System One model: one systemOne() call evaluates all routing
// questions against the state in parallel and returns typed noul answers
// with calibrated P(true) -- never generated text. No weights are
// downloaded; auth is TYPESAFE_API_KEY, used server-side only.
//
// Response contract (verified against @typesafe-ai/sdk 0.6.0 + docs):
//   const { answers, usage } = await client.systemOne(
//     { state, questions, model }, { timeout });
//   answers[label].noul -> number in [0, 1]
//   usage -> { input_tokens, output_tokens } | undefined
//
// Failure contract: this module never throws. Success resolves
// { decisions, confidences, usage, routingLatencyMs }; failure resolves
// { error } with one of:
//   jev-missing-key  no API key configured (fail fast, no network call)
//   jev-auth-error   401/403: key invalid or lacking access (NOT retried)
//   jev-unavailable  timeouts, 5xx, network faults (SDK already retried once)

import {
  TypeSafeClient,
  noul,
  AuthenticationError,
  PermissionDeniedError,
} from "@typesafe-ai/sdk";
import { getDecisionConfig } from "./config.mjs";
import { SUPPORTED_LABELS } from "./labels.mjs";

/** The ten routing questions, built with the official noul() helper. */
export function buildJevQuestions() {
  return {
    product_lookup: noul("Does this request require information about one or more specific products?"),
    product_discovery: noul("Is the user searching for a suitable product based on requirements or use case?"),
    specification: noul("Does the user request technical specifications, ratings, or datasheet values?"),
    pricing: noul("Does the user request pricing information such as price, cost, quotation, SST, or charges?"),
    inventory: noul("Does the user request availability, stock, lead time, delivery, or shipping information?"),
    supplier: noul("Does the user request supplier, manufacturer, brand, or sales-team information?"),
    policy: noul("Does answering this request require company or product policy information such as payment, warranty, returns, Incoterms, or SOP?"),
    comparison: noul("Does the request compare multiple products or alternatives?"),
    follow_up: noul("Does the user refer to previous conversation context with pronouns or phrases like it, this product, the second one, what about, or how about?"),
    general: noul("Is this general conversation (greeting, thanks, RFQ process help) that does not require knowledge retrieval?"),
  };
}

/**
 * Port of the SDK-side probability read: a noul answer carries P(true) as
 * `noul`. Returns null when absent or out of range.
 * @param {any} answer
 */
export function jevProbability(answer) {
  if (!answer || typeof answer !== "object") return null;
  const value = answer.noul;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }
  return null;
}

/**
 * Convert a Jev `answers` map into a { decisions, confidences } pair that
 * fits normalizeRouteResult(). Returns null when any label is missing or
 * out of range -- the caller must fall back, never guess.
 * @param {any} answers
 * @param {number} threshold
 */
export function jevDecisionsFromAnswers(answers, threshold = 0.5) {
  if (!answers || typeof answers !== "object") return null;
  const decisions = {};
  const confidences = {};
  for (const label of SUPPORTED_LABELS) {
    const prob = jevProbability(answers[label]);
    if (prob === null) return null;
    confidences[label] = prob;
    decisions[label] = prob >= threshold;
  }
  return { decisions, confidences };
}

/**
 * Create the official client. apiKey falls back to the SDK's own env lookup
 * (TYPESAFE_API_KEY); defaultModel falls back to TYPESAFE_DEFAULT_MODEL,
 * then jev-latest. One bounded retry on transient faults (SDK default).
 * @param {any} [config]
 */
export function createJevClient(config = getDecisionConfig()) {
  return new TypeSafeClient({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    defaultModel: config.model || "jev-latest",
    timeout: config.timeoutMs || 1500,
    maxRetries: 1,
  });
}

/**
 * One systemOne() call for all labels (never one call per label).
 * @param {{ query?: string, history?: string, productIds?: string[], threshold?: number, model?: string }} [input]
 * @param {{ config?: any, client?: any }} [options] `client` is injectable for tests
 */
export async function fetchJevRoute(
  { query, history = "", productIds = [], threshold, model } = {},
  { config = getDecisionConfig(), client } = {},
) {
  const started = Date.now();
  const effectiveThreshold = threshold ?? config.threshold ?? 0.5;
  if (!config.apiKey && !process.env.TYPESAFE_API_KEY) {
    return { error: "jev-missing-key" };
  }
  const jev = client || createJevClient(config);
  try {
    const response = await jev.systemOne(
      {
        state: {
          query: String(query || "").slice(0, 2000),
          history: String(history || "").slice(0, 2000),
          product_ids: Array.isArray(productIds) ? productIds.slice(0, 10) : [],
        },
        questions: buildJevQuestions(),
        model: model || config.model || "jev-latest",
      },
      { timeout: config.timeoutMs || 1500 },
    );
    const pair = jevDecisionsFromAnswers(response?.answers, effectiveThreshold);
    if (!pair) return { error: "jev-invalid-response" };
    return {
      ...pair,
      usage: response?.usage || null,
      model: response?.model || model || config.model || "jev-latest",
      routingLatencyMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return { error: "jev-auth-error" };
    }
    return { error: "jev-unavailable" };
  }
}
