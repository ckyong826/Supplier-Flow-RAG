// Experiment phases 1-3: fallback separation, complexity gate, planner
// safety net, and global evidence selection.
//
// Run: node --test tests/decision-router/selective.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { getDecisionConfig } from "../../app/api/ai-chat/decision-router/config.mjs";
import { isComplexCandidate } from "../../app/api/ai-chat/decision-router/complexity.mjs";
import { heuristicRoute } from "../../app/api/ai-chat/decision-router/heuristic.mjs";
import { buildRetrievalPlan } from "../../app/api/ai-chat/decision-router/planner.mjs";
import { aggregateEvidence } from "../../app/api/ai-chat/decision-router/orchestrator.mjs";
import { routeQuery } from "../../app/api/ai-chat/decision-router/router.mjs";
import { SUPPORTED_LABELS } from "../../app/api/ai-chat/decision-router/labels.mjs";

const catalogue = [{ id: "p1", sku: "A9F73140", name: "iC60N 40A" }];

function enabledConfig(extra = {}) {
  return getDecisionConfig({
    DECISION_ROUTER_ENABLED: "true",
    DECISION_PROVIDER: "jev",
    TYPESAFE_API_KEY: "test-key-not-a-secret",
    ...extra,
  });
}

function jevStub(overrides = {}) {
  const answers = Object.fromEntries(
    SUPPORTED_LABELS.map((l) => [l, { type: "noul", noul: overrides[l] ?? 0.1 }]),
  );
  return { systemOne: async () => ({ answers, usage: null, model: "jev-latest" }) };
}

function normalizedFor(intents) {
  const r = heuristicRoute("x", "", 0.5);
  const decisions = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, false]));
  for (const intent of intents) decisions[intent] = true;
  return { ...r, decisions, detectedIntents: intents.filter((l) => l !== "general") };
}

// ---------------------------------------------------------------- complexity gate

test("spec simple examples stay simple", () => {
  assert.equal(isComplexCandidate({ query: "What is A9F73140?", productIds: ["A9F73140"] }).complex, false);
  assert.equal(isComplexCandidate({ query: "What is the return policy?" }).complex, false);
  assert.equal(isComplexCandidate({ query: "What is an RCCB?" }).complex, false);
});

test("spec complex examples are candidates", () => {
  assert.ok(isComplexCandidate({ query: "Compare A9F73140 and A9F73240, including their specifications.", productIds: ["A9F73140", "A9F73240"] }).complex);
  assert.ok(isComplexCandidate({ query: "Which contactor is suitable for 30 kW at 400 V, and what are its installation requirements?" }).complex);
  assert.ok(isComplexCandidate({ query: "I need a 1-pole 40 A B-curve MCB. What product fits, and what payment and delivery terms apply?" }).complex);
});

test("gate keys on structure, not sentence count", () => {
  const longSingle = "What is the extremely detailed and thoroughly documented rated breaking capacity specification, including all relevant manufacturer footnotes and testing conditions, of the article numbered A9F73140 under IEC/EN 60898-1 as listed in the official catalogue?";
  assert.equal(isComplexCandidate({ query: longSingle, productIds: ["A9F73140"] }).complex, false);
  assert.ok(isComplexCandidate({ query: "A9F73140 vs A9D32625?", productIds: ["A9F73140", "A9D32625"] }).complex);
});

// ---------------------------------------------------------------- fallback separation

test("provider=heuristic plans multi-query with no Jev call", async () => {
  let calls = 0;
  const result = await routeQuery(
    { query: "Compare A9F73140 and LC1D09BD, which is cheaper?", history: [], products: catalogue },
    {
      config: enabledConfig({ DECISION_PROVIDER: "heuristic" }),
      client: { systemOne: async () => { calls += 1; throw new Error("Jev must not be called"); } },
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.source, "heuristic-multi");
  assert.equal(result.strategy, "multi");
  assert.equal(result.jevAttempted, false);
  assert.ok(result.normalized.detectedIntents.includes("comparison"));
});

test("selective gate keeps simple queries on legacy with no Jev call", async () => {
  let calls = 0;
  const result = await routeQuery(
    { query: "What is A9F73140?", history: [], products: catalogue },
    {
      config: enabledConfig({ DECISION_SELECTIVE: "true" }),
      client: { systemOne: async () => { calls += 1; throw new Error("Jev must not be called"); } },
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.strategy, "legacy");
  assert.equal(result.source, "selective-simple");
  assert.equal(result.jevAttempted, false);
  assert.ok(result.complexity && result.complexity.complex === false);
});

test("selective gate sends complex queries to Jev", async () => {
  let calls = 0;
  const result = await routeQuery(
    { query: "Compare A9F73140 and LC1D09BD, which is cheaper?", history: [], products: catalogue },
    {
      config: enabledConfig({ DECISION_SELECTIVE: "true" }),
      client: { systemOne: async () => { calls += 1; return jevStub({ product_lookup: 0.9, comparison: 0.9, pricing: 0.9 }).systemOne(); } },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.strategy, "multi");
  assert.equal(result.source, "jev");
  assert.equal(result.jevAttempted, true);
  assert.ok(result.complexity && result.complexity.complex === true);
});

test("Jev failure selects legacy strategy, never heuristic-multi", async () => {
  const result = await routeQuery(
    { query: "What is A9F73140?", history: [], products: catalogue },
    {
      config: enabledConfig(),
      client: { systemOne: async () => { throw new Error("timeout"); } },
    },
  );
  assert.equal(result.strategy, "legacy");
  assert.equal(result.jevAttempted, true);
  assert.equal(result.fallbackReason, "jev-unavailable");
  assert.notEqual(result.source, "heuristic-multi");
});

// ---------------------------------------------------------------- planner safety net

test("exact-only plans always carry a keyword safety net", () => {
  const plan = buildRetrievalPlan(normalizedFor(["product_lookup"]), {
    query: "What is UNKNOWN-999?",
    retrievalQuestion: "What is UNKNOWN-999?",
    productIds: [],
    unknownSkus: ["UNKNOWN-999"],
  });
  const types = plan.operations.map((op) => op.type);
  assert.ok(types.includes("exact_product"));
  assert.ok(types.includes("keyword"), `safety net missing: ${types.join(",")}`);
});

test("intent ops reuse the focused query without hint blobs", () => {
  const plan = buildRetrievalPlan(normalizedFor(["product_lookup", "policy"]), {
    query: "What is the warranty for A9F73140?",
    retrievalQuestion: "What is the warranty for A9F73140?",
    productIds: ["A9F73140"],
  });
  const policyOps = plan.operations.filter((op) => op.type === "policy");
  assert.equal(policyOps.length, 1);
  assert.equal(policyOps[0].query, "What is the warranty for A9F73140?");
});

test("duplicate operations are removed", () => {
  const plan = buildRetrievalPlan(normalizedFor(["policy"]), {
    query: "What is the return policy?",
    retrievalQuestion: "What is the return policy?",
  });
  const keys = plan.operations.map((op) => `${op.type}::${op.query}`);
  assert.equal(new Set(keys).size, keys.length);
});

// ---------------------------------------------------------------- global evidence selection

function chunk(title, content) {
  return { content, title, source_type: "policy", similarity: null };
}

test("global top-k caps merged multi-op context", () => {
  const plan = {
    operations: [
      { type: "keyword", query: "warranty", priority: 20 },
      { type: "policy", query: "warranty", priority: 30 },
    ],
  };
  const settled = [
    { status: "fulfilled", value: { operation: plan.operations[0], chunks: [chunk("A", "warranty term alpha"), chunk("B", "warranty term beta")], products: [] } },
    { status: "fulfilled", value: { operation: plan.operations[1], chunks: [chunk("C", "warranty term gamma"), chunk("D", "warranty term delta")], products: [] } },
  ];
  const evidence = aggregateEvidence(plan, settled, { question: "warranty", queries: [], globalTopK: 2 });
  assert.equal(evidence.documents.length, 2);
  assert.ok((evidence.droppedOperations || []).length > 0);
  assert.ok(evidence.missingInformation.some((m) => String(m).startsWith("dropped:")));
});

test("comparison pinning keeps every requested product", () => {
  const plan = {
    operations: [
      { type: "hybrid", query: "q AAA", productIds: ["AAA"], priority: 20 },
      { type: "hybrid", query: "q BBB", productIds: ["BBB"], priority: 20 },
    ],
  };
  const settled = [
    { status: "fulfilled", value: { operation: plan.operations[0], chunks: [chunk("A", "AAA specs here"), chunk("A2", "AAA more details")], products: [] } },
    { status: "fulfilled", value: { operation: plan.operations[1], chunks: [chunk("B", "BBB specs here")], products: [] } },
  ];
  const evidence = aggregateEvidence(plan, settled, { question: "compare", queries: [], globalTopK: 2 });
  const text = evidence.documents.map((d) => d.content).join(" ");
  assert.ok(text.includes("AAA") && text.includes("BBB"), "product B must not be dropped");
  assert.ok(!evidence.missingInformation.some((m) => String(m).startsWith("evidence:")));
});

test("budget cuts are reported honestly, never silent", () => {
  const plan = {
    operations: [
      { type: "keyword", query: "q", priority: 20 },
      { type: "policy", query: "q", priority: 30 },
    ],
  };
  const settled = [
    { status: "fulfilled", value: { operation: plan.operations[0], chunks: [chunk("A", "alpha")], products: [] } },
    { status: "fulfilled", value: { operation: plan.operations[1], chunks: [chunk("B", "beta")], products: [] } },
  ];
  const evidence = aggregateEvidence(plan, settled, { question: "q", queries: [], globalTopK: 1, tokenBudgetChars: 12000 });
  assert.equal(evidence.documents.length, 1);
  assert.ok(evidence.missingInformation.some((m) => String(m).startsWith("dropped:")));
  assert.ok(!evidence.completedOperations.includes("policy") || evidence.documents.some((d) => d.content === "beta"));
});
