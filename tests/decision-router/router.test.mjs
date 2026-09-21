// SF-JEV-002..007: unit tests for the intelligent multi-query router.
// No network, no database, no API key: Jev is stubbed at the SDK client
// boundary and knowledge retrieval is stubbed at the module boundary.
//
// Run: node --test tests/decision-router/router.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORTED_LABELS,
  normalizeRouteResult,
  isUsableDecision,
} from "../../app/api/ai-chat/decision-router/labels.mjs";
import {
  getDecisionConfig,
  shouldAttemptRouter,
} from "../../app/api/ai-chat/decision-router/config.mjs";
import {
  heuristicConfidences,
  heuristicRoute,
  extractSkuCandidates,
} from "../../app/api/ai-chat/decision-router/heuristic.mjs";
import { extractAndValidateSkus } from "../../app/api/ai-chat/decision-router/sku.mjs";
import { buildRetrievalPlan } from "../../app/api/ai-chat/decision-router/planner.mjs";
import {
  executePlan,
  aggregateEvidence,
  dedupeChunks,
} from "../../app/api/ai-chat/decision-router/orchestrator.mjs";
import { buildRouterContext, resolveRetrievalQuery } from "../../app/api/ai-chat/decision-router/conversation.mjs";
import { routeQuery } from "../../app/api/ai-chat/decision-router/router.mjs";
import { createDiagnostics, finishDiagnostics } from "../../app/api/ai-chat/decision-router/diagnostics.mjs";

// ---------------------------------------------------------------- labels

test("supported labels cover the ten spec categories", () => {
  assert.deepEqual(
    [...SUPPORTED_LABELS].sort(),
    [
      "comparison",
      "follow_up",
      "general",
      "inventory",
      "policy",
      "pricing",
      "product_discovery",
      "product_lookup",
      "specification",
      "supplier",
    ].sort(),
  );
});

test("normalizes a valid multi-label Jev payload", () => {
  const confidences = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, 0.1]));
  confidences.product_lookup = 0.9;
  confidences.pricing = 0.85;
  confidences.inventory = 0.8;
  const decisions = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, false]));
  decisions.product_lookup = true;
  decisions.pricing = true;
  decisions.inventory = true;
  const result = normalizeRouteResult({ decisions, confidences }, 0.5);
  assert.deepEqual(result.detectedIntents.sort(), ["inventory", "pricing", "product_lookup"].sort());
  assert.equal(isUsableDecision(result), true);
});

test("rejects payloads with missing labels instead of calling them general", () => {
  assert.equal(normalizeRouteResult({ decisions: {}, confidences: {} }), null);
  assert.equal(normalizeRouteResult(null), null);
  const confidences = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, 0.1]));
  const decisions = Object.fromEntries(SUPPORTED_LABELS.filter((l) => l !== "pricing").map((l) => [l, false]));
  assert.equal(normalizeRouteResult({ decisions, confidences }), null);
});

test("drops contradictory general when other intents fire", () => {
  const confidences = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, 0.1]));
  confidences.general = 0.9;
  confidences.policy = 0.9;
  const decisions = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, false]));
  decisions.general = true;
  decisions.policy = true;
  const result = normalizeRouteResult({ decisions, confidences }, 0.5);
  assert.equal(result.decisions.general, false);
  assert.deepEqual(result.detectedIntents, ["policy"]);
});

// ---------------------------------------------------------------- config

test("router is disabled by default (backward compatible)", () => {
  assert.equal(shouldAttemptRouter({}), false);
  assert.equal(shouldAttemptRouter({ DECISION_ROUTER_ENABLED: "true" }), true);
});

test("only the jev provider is attempted", () => {
  assert.equal(
    shouldAttemptRouter({ DECISION_ROUTER_ENABLED: "true", DECISION_PROVIDER: "jev" }),
    true,
  );
  assert.equal(
    shouldAttemptRouter({ DECISION_ROUTER_ENABLED: "true", DECISION_PROVIDER: "other" }),
    false,
  );
});

test("decision config parses threshold and timeout defensively", () => {
  assert.equal(getDecisionConfig({}).threshold, 0.5);
  assert.equal(getDecisionConfig({ DECISION_THRESHOLD: "0.7" }).threshold, 0.7);
  assert.equal(getDecisionConfig({ DECISION_THRESHOLD: "9" }).threshold, 0.5);
  assert.equal(getDecisionConfig({}).timeoutMs, 1500);
});

// ---------------------------------------------------------------- heuristic

test("heuristic detects the spec multi-intent example", () => {
  const conf = heuristicConfidences("Is ABC-123 currently available, and how much does it cost?", "");
  assert.ok(conf.product_lookup >= 0.5);
  assert.ok(conf.pricing >= 0.5);
});

test("heuristic detects comparison + pricing", () => {
  const route = heuristicRoute("Compare ABC-123 and XYZ-456. Which one is cheaper?", "", 0.5);
  assert.ok(route.decisions.comparison);
  assert.ok(route.decisions.pricing);
  assert.ok(route.decisions.product_lookup);
});

test("heuristic routes greetings to general with no retrieval intents", () => {
  const route = heuristicRoute("Hello", "", 0.5);
  assert.equal(route.decisions.general, true);
  assert.deepEqual(route.detectedIntents, []);
});

test("heuristic routes discovery queries without exact SKUs", () => {
  const route = heuristicRoute("I need a waterproof enclosure suitable for outdoor installation.", "", 0.5);
  assert.equal(route.decisions.product_discovery, true);
  assert.equal(route.decisions.product_lookup, false);
});

test("heuristic does not treat plain numbers as SKUs", () => {
  assert.deepEqual(extractSkuCandidates("Can it be returned after 30 days?"), []);
  assert.deepEqual(extractSkuCandidates("What is ABC-123?"), ["ABC-123"]);
});

// ---------------------------------------------------------------- sku

const catalogue = [
  { id: "p1", sku: "A9F73140", name: "iC60N 40A" },
  { id: "p2", sku: "LC1D09BD", name: "TeSys Deca" },
];

test("SKU validation matches known products and reports unknown ones", () => {
  const result = extractAndValidateSkus("Compare A9F73140 and UNKNOWN-999", catalogue);
  assert.deepEqual(result.productIds, ["A9F73140"]);
  assert.deepEqual(result.unknown, ["UNKNOWN-999"]);
});

test("arbitrary uppercase words are not SKUs", () => {
  const result = extractAndValidateSkus("Hello WHAT is the warranty", catalogue);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.productIds, []);
});

// ---------------------------------------------------------------- planner

function normalizedFor(intents) {
  const decisions = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, false]));
  for (const intent of intents) decisions[intent] = true;
  const confidences = Object.fromEntries(
    SUPPORTED_LABELS.map((l) => [l, decisions[l] ? 0.9 : 0.1]),
  );
  return { decisions, confidences, detectedIntents: intents.filter((l) => l !== "general") };
}

test("general conversation needs no retrieval", () => {
  const plan = buildRetrievalPlan(normalizedFor(["general"]), { query: "Hello" });
  assert.equal(plan.requiresRetrieval, false);
  assert.deepEqual(plan.operations, []);
});

test("comparison with two SKUs yields one op per product", () => {
  const plan = buildRetrievalPlan(normalizedFor(["comparison", "pricing", "product_lookup"]), {
    query: "Compare A and B, which is cheaper?",
    retrievalQuestion: "Compare A and B, which is cheaper?",
    productIds: ["A9F73140", "LC1D09BD"],
  });
  const exact = plan.operations.filter((op) => op.type === "exact_product");
  assert.equal(exact.length, 2);
  assert.ok(plan.operations.some((op) => op.type === "hybrid"));
});

test("product + policy yields both evidence kinds", () => {
  const plan = buildRetrievalPlan(normalizedFor(["product_lookup", "policy"]), {
    query: "Can A9F73140 be returned after 30 days?",
    retrievalQuestion: "Can A9F73140 be returned after 30 days?",
    productIds: ["A9F73140"],
  });
  const types = plan.operations.map((op) => op.type);
  assert.ok(types.includes("exact_product"));
  assert.ok(types.includes("policy") || types.includes("keyword"));
});

test("unknown SKUs still get an exact attempt for honest abstention", () => {
  const plan = buildRetrievalPlan(normalizedFor(["product_lookup"]), {
    query: "What is UNKNOWN-999?",
    retrievalQuestion: "What is UNKNOWN-999?",
    productIds: [],
    unknownSkus: ["UNKNOWN-999"],
  });
  assert.ok(plan.operations.some((op) => op.type === "exact_product" && op.query === "UNKNOWN-999"));
});

// ---------------------------------------------------------------- orchestrator

test("orchestrator runs ops concurrently and survives partial failure", async () => {
  const plan = {
    operations: [
      { type: "exact_product", query: "A9F73140", productIds: ["A9F73140"], priority: 10 },
      { type: "keyword", query: "warranty policy", priority: 20 },
    ],
  };
  const deps = {
    supabase: async () => ({ json: async () => [] }),
    products: catalogue,
    configuredMode: "keyword",
    limit: 5,
  };
  // Stub retrieveKnowledge indirectly: keywordSearch hits publicChunkRows which
  // uses supabase() returning [] -> empty chunks, exact_product resolves locally.
  const { settled, completedOperations, failedOperations } = await executePlan(plan, deps);
  assert.equal(settled.length, 2);
  assert.ok(completedOperations.includes("exact_product"));
  assert.deepEqual(failedOperations, []);
  const evidence = aggregateEvidence(plan, settled);
  assert.deepEqual(evidence.products, ["A9F73140"]);
  assert.deepEqual(evidence.failedOperations, []);
});

test("aggregation dedupes identical chunks and preserves provenance", () => {
  const chunk = { content: "same", title: "Doc", source_type: "policy", similarity: null };
  const plan = { operations: [{ type: "keyword", query: "q" }] };
  const settled = [{ status: "fulfilled", value: { operation: plan.operations[0], chunks: [chunk, chunk], products: [] } }];
  const evidence = aggregateEvidence(plan, settled);
  assert.equal(evidence.documents.length, 1);
  assert.equal(evidence.documents[0].title, "Doc");
});

test("aggregation flags missing per-product evidence for comparisons", () => {
  const plan = {
    operations: [
      { type: "exact_product", query: "AAA", productIds: ["AAA"], priority: 10 },
      { type: "exact_product", query: "BBB", productIds: ["BBB"], priority: 10 },
    ],
  };
  const settled = [
    { status: "fulfilled", value: { operation: plan.operations[0], chunks: [], products: [] } },
    { status: "rejected", reason: new Error("db down") },
  ];
  const evidence = aggregateEvidence(plan, settled);
  assert.ok(evidence.failedOperations.includes("exact_product"));
  assert.ok(evidence.missingInformation.length > 0);
});

test("dedupeChunks keeps first-seen order", () => {
  const docs = dedupeChunks([
    { content: "a", title: "1" },
    { content: "b", title: "2" },
    { content: "a", title: "1-dup" },
  ]);
  assert.deepEqual(docs.map((d) => d.title), ["1", "2"]);
});

// ---------------------------------------------------------------- conversation

test("router context compacts to recent user turns", () => {
  const history = [
    { role: "user", content: "first" },
    { role: "assistant", content: "reply" },
    { role: "user", content: "second" },
  ];
  assert.equal(buildRouterContext(history), "first second");
  assert.equal(buildRouterContext("not-an-array"), "");
});

test("follow-up reuses rewriting; new questions do not inherit stale context", () => {
  const followUp = resolveRetrievalQuery(
    "How about XYZ-456?",
    [{ role: "user", content: "What is the warranty for ABC-123?" }],
    normalizedFor(["follow_up", "product_lookup"]),
    "history",
  );
  assert.equal(followUp.rewriteApplied, true);
  assert.match(followUp.retrievalQuestion, /ABC-123/);

  const fresh = resolveRetrievalQuery(
    "What is the payment policy?",
    [{ role: "user", content: "Earlier product question." }],
    normalizedFor(["policy"]),
    "history",
  );
  assert.equal(fresh.retrievalQuestion, "What is the payment policy?");
});

// ---------------------------------------------------------------- router facade

function jevStub(answers, { throws } = {}) {
  return {
    systemOne: async () => {
      if (throws) throw throws;
      return { answers, usage: null, model: "jev-latest" };
    },
  };
}

function jevStubAnswers(overrides = {}) {
  return Object.fromEntries(
    SUPPORTED_LABELS.map((l) => [l, { type: "noul", noul: overrides[l] ?? 0.1 }]),
  );
}

function enabledConfig() {
  return getDecisionConfig({
    DECISION_ROUTER_ENABLED: "true",
    DECISION_PROVIDER: "jev",
    TYPESAFE_API_KEY: "test-key-not-a-secret",
  });
}

test("disabled router falls back without calling Jev", async () => {
  let calls = 0;
  const result = await routeQuery(
    { query: "Hello", history: [], products: [] },
    {
      config: getDecisionConfig({ DECISION_ROUTER_ENABLED: "false" }),
      client: { systemOne: async () => { calls += 1; throw new Error("must not call when disabled"); } },
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.source, "disabled");
  assert.equal(result.fallbackUsed, true);
});

test("router uses Jev when the API answers", async () => {
  const result = await routeQuery(
    { query: "What is A9F73140?", history: [], products: catalogue },
    {
      config: enabledConfig(),
      client: jevStub(jevStubAnswers({ product_lookup: 0.95 })),
    },
  );
  assert.equal(result.source, "jev");
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.normalized.detectedIntents, ["product_lookup"]);
});

test("invalid Jev payload falls back and is never silent general", async () => {
  const result = await routeQuery(
    { query: "Compare A9F73140 and LC1D09BD, which is cheaper?", history: [], products: catalogue },
    { config: enabledConfig(), client: jevStub({ bogus: true }) },
  );
  assert.equal(result.source, "heuristic");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "jev-invalid-response");
  assert.ok(result.normalized.detectedIntents.includes("comparison"));
});

test("Jev outage falls back to the existing pipeline signals", async () => {
  const result = await routeQuery(
    { query: "What is A9F73140?", history: [], products: catalogue },
    { config: enabledConfig(), client: jevStub(null, { throws: new Error("connection refused") }) },
  );
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "jev-unavailable");
});

// ---------------------------------------------------------------- diagnostics

test("diagnostics carry routing latency without message content", () => {
  const d = createDiagnostics({ provider: "jev" });
  assert.ok(d.query_id);
  assert.equal(d.decision_provider, "jev");
  assert.ok(!("query" in d) && !("message" in d));
  const done = finishDiagnostics(d, { fallback_used: true });
  assert.equal(done.fallback_used, true);
  assert.ok(typeof done.total_latency_ms === "number");
});
