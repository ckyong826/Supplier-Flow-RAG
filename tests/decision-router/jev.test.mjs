// TypeSafe Jev provider tests (official @typesafe-ai/sdk).
// No network, no API key: the SDK client is stubbed at the module boundary.
// The key itself is never asserted by value and never logged.
//
// Run: node --test tests/decision-router/jev.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { AuthenticationError } from "@typesafe-ai/sdk";

import { getDecisionConfig, shouldAttemptRouter } from "../../app/api/ai-chat/decision-router/config.mjs";
import {
  buildJevQuestions,
  jevProbability,
  jevDecisionsFromAnswers,
  fetchJevRoute,
} from "../../app/api/ai-chat/decision-router/jev.mjs";
import { SUPPORTED_LABELS } from "../../app/api/ai-chat/decision-router/labels.mjs";
import { routeQuery } from "../../app/api/ai-chat/decision-router/router.mjs";

const catalogue = [{ id: "p1", sku: "A9F73140", name: "iC60N 40A" }];

function jevAnswers(overrides = {}) {
  const base = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, { type: "noul", noul: 0.1 }]));
  for (const [label, prob] of Object.entries(overrides)) base[label] = { type: "noul", noul: prob };
  return base;
}

function jevConfig(extra = {}) {
  return getDecisionConfig({
    DECISION_ROUTER_ENABLED: "true",
    DECISION_PROVIDER: "jev",
    TYPESAFE_API_KEY: "test-key-not-a-secret",
    ...extra,
  });
}

function stubClient({ answers, usage, model, throws } = {}) {
  const seen = [];
  return {
    seen,
    client: {
      systemOne: async (request, options) => {
        seen.push({ request, options });
        if (throws) throw throws;
        return { answers: answers || jevAnswers(), usage: usage || null, model: model || "jev-latest" };
      },
    },
  };
}

// ---------------------------------------------------------------- protocol

test("buildJevQuestions covers all ten labels with noul helpers", () => {
  const questions = buildJevQuestions();
  assert.deepEqual(Object.keys(questions).sort(), [...SUPPORTED_LABELS].sort());
  for (const label of SUPPORTED_LABELS) {
    assert.equal(questions[label].type, "noul");
    assert.ok(typeof questions[label].instructions === "string" && questions[label].instructions.length > 10);
  }
});

test("jevProbability reads noul answers and rejects garbage", () => {
  assert.equal(jevProbability({ type: "noul", noul: 0.8 }), 0.8);
  assert.equal(jevProbability({ noul: 0 }), 0);
  assert.equal(jevProbability(null), null);
  assert.equal(jevProbability({}), null);
  assert.equal(jevProbability({ noul: 1.5 }), null);
  assert.equal(jevProbability({ noul: "high" }), null);
});

test("jevDecisionsFromAnswers builds decisions at the threshold", () => {
  const pair = jevDecisionsFromAnswers(jevAnswers({ product_lookup: 0.9, pricing: 0.8 }), 0.5);
  assert.equal(pair.decisions.product_lookup, true);
  assert.equal(pair.decisions.pricing, true);
  assert.equal(pair.decisions.policy, false);
  assert.equal(pair.confidences.pricing, 0.8);
});

test("jevDecisionsFromAnswers rejects missing labels instead of guessing", () => {
  const answers = jevAnswers({ product_lookup: 0.9 });
  delete answers.pricing;
  assert.equal(jevDecisionsFromAnswers(answers, 0.5), null);
  assert.equal(jevDecisionsFromAnswers(null, 0.5), null);
});

// ---------------------------------------------------------------- client

test("jev client makes one systemOne call with state, questions and model", async () => {
  const { seen, client } = stubClient({ answers: jevAnswers({ product_lookup: 0.9 }) });
  const result = await fetchJevRoute(
    { query: "What is A9F73140?", history: "", productIds: ["A9F73140"] },
    { config: jevConfig(), client },
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].request.model, "jev-latest");
  assert.equal(seen[0].request.state.query, "What is A9F73140?");
  assert.deepEqual(seen[0].request.state.product_ids, ["A9F73140"]);
  assert.deepEqual(Object.keys(seen[0].request.questions).sort(), [...SUPPORTED_LABELS].sort());
  assert.equal(seen[0].options.timeout, 1500);
  assert.equal(result.decisions.product_lookup, true);
  assert.ok(typeof result.routingLatencyMs === "number");
});

test("jev client passes usage through for cost tracking", async () => {
  const { client } = stubClient({
    answers: jevAnswers(),
    usage: { input_tokens: 392, output_tokens: 65 },
    model: "jev-1.13.0",
  });
  const result = await fetchJevRoute({ query: "Hello" }, { config: jevConfig(), client });
  assert.deepEqual(result.usage, { input_tokens: 392, output_tokens: 65 });
  assert.equal(result.model, "jev-1.13.0");
});

test("jev client fails fast with jev-missing-key and makes no call", async () => {
  const { seen, client } = stubClient();
  const result = await fetchJevRoute(
    { query: "Hello" },
    { config: jevConfig({ TYPESAFE_API_KEY: "" }), client },
  );
  assert.deepEqual(result, { error: "jev-missing-key" });
  assert.equal(seen.length, 0);
});

test("jev client maps auth failures to jev-auth-error", async () => {
  const { client } = stubClient({ throws: new AuthenticationError(401, { error: "invalid key" }, new Headers()) });
  const result = await fetchJevRoute({ query: "Hello" }, { config: jevConfig(), client });
  assert.deepEqual(result, { error: "jev-auth-error" });
});

test("jev client maps outages to jev-unavailable", async () => {
  const { client } = stubClient({ throws: new Error("socket hang up") });
  const result = await fetchJevRoute({ query: "Hello" }, { config: jevConfig(), client });
  assert.deepEqual(result, { error: "jev-unavailable" });
});

test("jev client maps invalid answers to jev-invalid-response", async () => {
  const { client } = stubClient({ answers: { product_lookup: { noul: 0.9 } } });
  const result = await fetchJevRoute({ query: "Hello" }, { config: jevConfig(), client });
  assert.deepEqual(result, { error: "jev-invalid-response" });
});

// ---------------------------------------------------------------- chain

test("provider=jev returns hosted decisions with usage", async () => {
  const { seen, client } = stubClient({
    answers: jevAnswers({ product_lookup: 0.95 }),
    usage: { input_tokens: 100, output_tokens: 20 },
  });
  const result = await routeQuery(
    { query: "What is A9F73140?", history: [], products: catalogue },
    { config: jevConfig(), client },
  );
  assert.equal(result.source, "jev");
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.normalized.detectedIntents, ["product_lookup"]);
  assert.deepEqual(result.usage, { input_tokens: 100, output_tokens: 20 });
  assert.equal(seen.length, 1);
});

test("jev auth failure surfaces clearly and falls back without credentials", async () => {
  const { client } = stubClient({ throws: new AuthenticationError(401, { error: "bad key" }, new Headers()) });
  const result = await routeQuery(
    { query: "What is A9F73140?", history: [], products: catalogue },
    { config: jevConfig(), client },
  );
  assert.equal(result.source, "heuristic");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "jev-auth-error");
  assert.ok(!JSON.stringify(result).includes("test-key-not-a-secret"));
});

test("jev outage falls back to the existing pipeline signals", async () => {
  const { client } = stubClient({ throws: new Error("connection refused") });
  const result = await routeQuery(
    { query: "Compare A9F73140 and LC1D09BD, which is cheaper?", history: [], products: catalogue },
    { config: jevConfig(), client },
  );
  assert.equal(result.source, "heuristic");
  assert.equal(result.fallbackReason, "jev-unavailable");
  assert.ok(result.normalized.detectedIntents.includes("comparison"));
});

test("invalid Jev payload falls back and is never silent general", async () => {
  const { client } = stubClient({ answers: { bogus: true } });
  const result = await routeQuery(
    { query: "Compare A9F73140 and LC1D09BD, which is cheaper?", history: [], products: catalogue },
    { config: jevConfig(), client },
  );
  assert.equal(result.source, "heuristic");
  assert.equal(result.fallbackReason, "jev-invalid-response");
  assert.ok(result.normalized.detectedIntents.includes("comparison"));
});

test("missing key fails fast to heuristic", async () => {
  const { seen, client } = stubClient();
  const result = await routeQuery(
    { query: "Hello", history: [], products: [] },
    { config: jevConfig({ TYPESAFE_API_KEY: "" }), client },
  );
  assert.equal(result.source, "heuristic");
  assert.equal(result.fallbackReason, "jev-missing-key");
  assert.equal(seen.length, 0);
});

// ---------------------------------------------------------------- config

test("shouldAttemptRouter allows jev, blocks everything else", () => {
  assert.equal(
    shouldAttemptRouter({ DECISION_ROUTER_ENABLED: "true", DECISION_PROVIDER: "jev" }),
    true,
  );
  assert.equal(shouldAttemptRouter({}), false);
  assert.equal(
    shouldAttemptRouter({ DECISION_ROUTER_ENABLED: "true", DECISION_PROVIDER: "other" }),
    false,
  );
});

test("typesafe credentials default to jev-latest", () => {
  const config = getDecisionConfig({ DECISION_ROUTER_ENABLED: "true" });
  assert.equal(config.provider, "jev");
  assert.equal(config.model, "jev-latest");
  assert.equal(config.apiKey, "");
  assert.equal(
    getDecisionConfig({ TYPESAFE_DEFAULT_MODEL: "jev-1.13.0" }).model,
    "jev-1.13.0",
  );
});
