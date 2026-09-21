// Routing accuracy eval (SF-JEV-008): heuristic baseline vs Jev candidate.
//
// Scores multi-label intent classification on tests/rag-eval/routing-fixture.json.
// The heuristic router always runs offline (no network, no key). The Jev
// candidate runs against the official TypeSafe API (needs TYPESAFE_API_KEY):
//
//   node tests/rag-eval/run-routing-eval.mjs                       # heuristic only
//   node tests/rag-eval/run-routing-eval.mjs --provider jev        # + hosted Jev
//   node tests/rag-eval/run-routing-eval.mjs --sweep                # threshold tuning
//   node tests/rag-eval/run-routing-eval.mjs --json tests/rag-eval/results-routing.json
//
// Do not claim routing wins without running the --provider jev comparison:
// routing quality must be measured, not assumed. The key is read from the
// environment by the SDK and is never printed by this runner.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { heuristicRoute, extractSkuCandidates } from "../../app/api/ai-chat/decision-router/heuristic.mjs";
import { SUPPORTED_LABELS } from "../../app/api/ai-chat/decision-router/labels.mjs";
import { fetchJevRoute } from "../../app/api/ai-chat/decision-router/jev.mjs";
import { getDecisionConfig } from "../../app/api/ai-chat/decision-router/config.mjs";
import { buildRetrievalPlan } from "../../app/api/ai-chat/decision-router/planner.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

// Local-only convenience: plain node does not load .env files (Next.js does
// at dev runtime). Mirror scripts/seed-products.mjs: fill unset vars from
// .env then .env.local (later files win, shell env always wins). Values are
// never printed by this runner.
for (const file of [".env", ".env.local"]) {
  const path = join(here, "..", "..", file);
  if (!existsSync(path)) continue;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep < 1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const provider = (flag("--provider", args.includes("--laya") ? "laya" : "heuristic") || "heuristic").toLowerCase();
const doSweep = args.includes("--sweep");
const jsonOut = flag("--json", null);
const threshold = Number(flag("--threshold", process.env.DECISION_THRESHOLD || "0.5")) || 0.5;
const delayMs = Number(flag("--delay", 500)) || 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Jev pricing: $0.042 per 1M input tokens, output free (public TypeSafe
// listings, Sep 2026; override with flags if your plan differs).
const priceInPerM = Number(flag("--price-in", "0.042"));
const priceOutPerM = Number(flag("--price-out", "0"));

if (provider === "laya") {
  console.error("The local Laya service was removed; use --provider jev (needs TYPESAFE_API_KEY).");
  process.exit(2);
}
if (!["heuristic", "jev"].includes(provider)) {
  console.error(`Unknown --provider ${provider}; use heuristic or jev.`);
  process.exit(2);
}

const fixtureFile = args.includes("--heldout") ? "routing-heldout.json" : "routing-fixture.json";
const fixture = JSON.parse(readFileSync(join(here, fixtureFile), "utf8"));
const cases = fixture.cases;

function predictedSet(pred) {
  // detectedIntents excludes "general" by design; map a general decision back
  // so greetings score correctly.
  if (pred.decisions && pred.decisions.general) return new Set(["general"]);
  return new Set(pred.detectedIntents || []);
}

function setsEqual(a, b) {
  return a.size === b.size && [...a].every((l) => b.has(l));
}

function scoreCases(predictions) {
  let exact = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const perLabel = Object.fromEntries(SUPPORTED_LABELS.map((l) => [l, { tp: 0, fp: 0, fn: 0 }]));
  const perCategory = new Map();
  predictions.forEach((pred, i) => {
    const expected = new Set(cases[i].expected_intents);
    const got = predictedSet(pred);
    const match = expected.size === got.size && [...expected].every((l) => got.has(l));
    if (match) exact += 1;
    for (const label of SUPPORTED_LABELS) {
      const e = expected.has(label);
      const g = got.has(label);
      if (e && g) { tp += 1; perLabel[label].tp += 1; }
      else if (!e && g) { fp += 1; perLabel[label].fp += 1; }
      else if (e && !g) { fn += 1; perLabel[label].fn += 1; }
    }
    const bucket = perCategory.get(cases[i].category) || { total: 0, exact: 0 };
    bucket.total += 1;
    if (match) bucket.exact += 1;
    perCategory.set(cases[i].category, bucket);
  });
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return {
    exactMatch: predictions.length ? exact / predictions.length : 0,
    microPrecision: precision,
    microRecall: recall,
    microF1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    perLabel,
    perCategory: [...perCategory.entries()].map(([category, b]) => ({ category, ...b })),
  };
}

async function predictJev(query, history, config) {
  const started = Date.now();
  const raw = await fetchJevRoute(
    { query, history, threshold, model: config.model },
    { config },
  );
  if (raw?.error) return { error: raw.error, latencyMs: Date.now() - started };
  const decisions = {};
  for (const label of SUPPORTED_LABELS) decisions[label] = Boolean(raw.decisions?.[label]);
  return {
    decisions,
    detectedIntents: SUPPORTED_LABELS.filter((l) => l !== "general" && decisions[l]),
    latencyMs: raw.routingLatencyMs ?? Date.now() - started,
    usage: raw.usage || null,
  };
}

const baselineStart = Date.now();
const baseline = cases.map((c) => {
  const started = Date.now();
  const r = heuristicRoute(c.query, c.history || "", threshold);
  return { decisions: r.decisions, detectedIntents: r.detectedIntents, latencyMs: Date.now() - started };
});
const baselineMs = Date.now() - baselineStart;
const baselineScore = scoreCases(baseline);

// Operation necessity: planned op types (heuristic intents through the real
// planner; candidates treated as validated catalogue hits) vs the required
// ops labelled per case. An extra op is not automatically beneficial.
const opCases = cases.filter((c) => Array.isArray(c.required_ops));
const opResults = opCases.map((c) => {
  const r = heuristicRoute(c.query, c.history || "", threshold);
  const decisions = {};
  for (const label of SUPPORTED_LABELS) decisions[label] = (r.confidences[label] ?? 0) >= threshold;
  if (decisions.general && Object.keys(decisions).some((l) => l !== "general" && decisions[l])) decisions.general = false;
  const candidates = extractSkuCandidates(c.query);
  const plan = buildRetrievalPlan(
    { decisions, detectedIntents: SUPPORTED_LABELS.filter((l) => l !== "general" && decisions[l]) },
    { query: c.query, retrievalQuestion: `${c.history || ""} ${c.query}`.trim(), productIds: candidates, unknownSkus: [] },
  );
  const planned = [...new Set(plan.operations.map((op) => op.type))];
  const required = [...new Set(c.required_ops)];
  const hit = planned.filter((t) => required.includes(t));
  return { id: c.id, planned, required, hit };
});
const opHit = opResults.reduce((s, r) => s + r.hit.length, 0);
const opPlanned = opResults.reduce((s, r) => s + r.planned.length, 0);
const opRequired = opResults.reduce((s, r) => s + r.required.length, 0);
const opPrecision = opPlanned ? opHit / opPlanned : 1;
const opRecall = opRequired ? opHit / opRequired : 1;

console.log(`Routing eval: ${cases.length} cases (${fixtureFile}), threshold=${threshold}`);
console.log(`Baseline (heuristic, offline): exact-match=${(baselineScore.exactMatch * 100).toFixed(1)}% ` +
  `P=${(baselineScore.microPrecision * 100).toFixed(1)}% R=${(baselineScore.microRecall * 100).toFixed(1)}% ` +
  `F1=${(baselineScore.microF1 * 100).toFixed(1)}% (${baselineMs}ms total)`);
console.log(`Op necessity (planned vs required ops): precision=${(opPrecision * 100).toFixed(1)}% recall=${(opRecall * 100).toFixed(1)}% over ${opResults.length} labelled cases`);

let candidate = null;
let candidateScore = null;
let candidateUsage = null;
let candidateCost = null;
if (provider === "jev") {
  const config = getDecisionConfig();
  if (!config.apiKey && !process.env.TYPESAFE_API_KEY) {
    console.log("Jev candidate: TYPESAFE_API_KEY is not set; scoring heuristic only.");
  } else {
    candidate = [];
    for (const c of cases) {
      candidate.push(await predictJev(c.query, c.history || "", config));
      if (delayMs) await sleep(delayMs);
    }
    const failed = candidate.filter((p) => p.error);
    if (failed.length === candidate.length) {
      console.log(`Jev candidate: all ${candidate.length} queries failed (${failed[0].error}). Check the key and network.`);
      candidate = null;
    } else {
      candidateScore = scoreCases(candidate.map((p) => (
        p.error ? { detectedIntents: [] } : { decisions: p.decisions, detectedIntents: p.detectedIntents }
      )));
      const ok = candidate.filter((p) => !p.error);
      const avgLatency = ok.reduce((s, p) => s + (p.latencyMs || 0), 0) / ok.length;
      const inTokens = ok.reduce((s, p) => s + (p.usage?.input_tokens || 0), 0);
      const outTokens = ok.reduce((s, p) => s + (p.usage?.output_tokens || 0), 0);
      const costUsd = inTokens / 1e6 * priceInPerM + outTokens / 1e6 * priceOutPerM;
      candidateUsage = { inputTokens: inTokens, outputTokens: outTokens, measuredQueries: ok.length };
      candidateCost = { totalUsd: costUsd, perQueryUsd: ok.length ? costUsd / ok.length : null, priceInPerM, priceOutPerM };
      console.log(`Candidate (Jev ${config.model}): exact-match=${(candidateScore.exactMatch * 100).toFixed(1)}% ` +
        `P=${(candidateScore.microPrecision * 100).toFixed(1)}% R=${(candidateScore.microRecall * 100).toFixed(1)}% ` +
        `F1=${(candidateScore.microF1 * 100).toFixed(1)}% avg ${avgLatency.toFixed(0)}ms/query ` +
        `tokens in/out ${inTokens}/${outTokens} cost $${costUsd.toFixed(6)} total ($${(candidateCost.perQueryUsd || 0).toFixed(6)}/query)`);
      if (failed.length) console.log(`  note: ${failed.length}/${candidate.length} queries failed (${failed[0].error}) and scored as empty.`);
    }
  }
}

if (doSweep) {
  console.log("\nThreshold sweep (heuristic baseline):");
  console.log("| Threshold | Exact-match | Micro-P | Micro-R | Micro-F1 |");
  console.log("|---|---:|---:|---:|---:|");
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const preds = cases.map((c) => {
      const r = heuristicRoute(c.query, c.history || "", t);
      return { decisions: r.decisions, detectedIntents: r.detectedIntents };
    });
    const s = scoreCases(preds);
    console.log(`| ${t.toFixed(1)} | ${(s.exactMatch * 100).toFixed(1)}% | ${(s.microPrecision * 100).toFixed(1)}% | ${(s.microRecall * 100).toFixed(1)}% | ${(s.microF1 * 100).toFixed(1)}% |`);
  }
}

console.log("\nPer-category exact-match (baseline):");
for (const row of baselineScore.perCategory) {
  console.log(`  ${row.category.padEnd(18)} ${row.exact}/${row.total}`);
}

const failures = cases
  .map((c, i) => ({ c, pred: [...predictedSet(baseline[i])] }))
  .filter(({ c, pred }) => {
    const e = new Set(c.expected_intents);
    const g = new Set(pred);
    return !(e.size === g.size && [...e].every((l) => g.has(l)));
  });
if (failures.length) {
  console.log(`\nBaseline misses (${failures.length}):`);
  for (const { c, pred } of failures) {
    console.log(`  [${c.id}] Q: ${c.query.slice(0, 70)}`);
    console.log(`       expected: ${c.expected_intents.join(",")} | got: ${pred.join(",") || "(none)"}`);
  }
}

if (candidate) {
  const candFailures = cases
    .map((c, i) => ({
      c,
      pred: candidate[i].error ? [`error:${candidate[i].error}`] : [...predictedSet(candidate[i])],
    }))
    .filter(({ c, pred }) => {
      const e = new Set(c.expected_intents);
      const g = new Set(pred);
      return !(e.size === g.size && [...e].every((l) => g.has(l)));
    });
  if (candFailures.length) {
    console.log(`\nCandidate misses (${candFailures.length}):`);
    for (const { c, pred } of candFailures) {
      console.log(`  [${c.id}] Q: ${c.query.slice(0, 70)}`);
      console.log(`       expected: ${c.expected_intents.join(",")} | got: ${pred.join(",") || "(none)"}`);
    }
  }

  console.log("\nPer-case comparison (expected | baseline | jev):");
  console.log("| ID | Category | Expected | Baseline | Jev | B | J |");
  console.log("|---|---|---|---|---|---|---|");
  cases.forEach((c, i) => {
    const exp = new Set(c.expected_intents);
    const bSet = predictedSet(baseline[i]);
    const jSet = candidate[i].error ? new Set([`error:${candidate[i].error}`]) : predictedSet(candidate[i]);
    const b = [...bSet].join("+") || "(none)";
    const j = [...jSet].join("+") || "(none)";
    const bOk = setsEqual(exp, predictedSet(baseline[i])) ? "✓" : "✗";
    const jOk = !candidate[i].error && setsEqual(exp, predictedSet(candidate[i])) ? "✓" : "✗";
    console.log(`| ${c.id} | ${c.category} | ${[...exp].join("+")} | ${b} | ${j} | ${bOk} | ${jOk} |`);
  });
}

const opMisses = opResults.filter((r) => r.hit.length !== r.planned.length || r.hit.length !== r.required.length);
if (opMisses.length) {
  console.log(`\nOp necessity misses (${opMisses.length}):`);
  for (const r of opMisses) {
    console.log(`  [${r.id}] required: ${r.required.join(",") || "(none)"} | planned: ${r.planned.join(",") || "(none)"}`);
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    ranAt: new Date().toISOString(),
    threshold,
    provider,
    baseline: { ...baselineScore, totalMs: baselineMs },
    opNecessity: { precision: opPrecision, recall: opRecall, labelledCases: opResults.length },
    candidate: candidateScore ? { ...candidateScore, usage: candidateUsage, cost: candidateCost } : null,
    results: cases.map((c, i) => ({
      id: c.id,
      category: c.category,
      query: c.query,
      expected: c.expected_intents,
      baseline: baseline[i].detectedIntents,
      candidate: candidate ? (candidate[i].error ? `error:${candidate[i].error}` : candidate[i].detectedIntents) : undefined,
    })),
  }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}

process.exit(0);
