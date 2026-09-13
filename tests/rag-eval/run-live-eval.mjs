// End-to-end eval against the running SupplierFlow app.
//
// POSTs each question to /api/ai-chat and grades the generated answer. This is the pass that
// catches hallucination: the offline runner can only tell you whether the right text reached
// the context window, not whether the model stayed inside it.
//
// Prerequisites:
//   1. dev server running            npm run dev
//   2. DEEPSEEK_API_KEY set          otherwise the route returns canned fallbacks and the
//                                    eval measures nothing about generation
//   3. KB documents loaded into Supabase knowledge_chunks (POST /api/admin/knowledge),
//      otherwise SUPPORT KNOWLEDGE is empty and every policy question will fail
//
// Run: node tests/rag-eval/run-live-eval.mjs [--base http://localhost:3000] [--json out.json]
//                                            [--delay 400] [--only D01,A09] [--concurrency 2]

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contains, matchesAny, looksLikeAbstention } from "./match.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const base = flag("--base", process.env.EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const jsonOut = flag("--json", null);
const delayMs = Number(flag("--delay", 400));
const concurrency = Math.max(1, Math.floor(Number(flag("--concurrency", 1)) || 1));
const only = flag("--only", null)?.split(",").map((id) => id.trim());
const pricing = {
  inputCacheHit: Number(flag("--input-cache-hit", 0.007)),
  inputCacheMiss: Number(flag("--input-cache-miss", 0.22)),
  output: Number(flag("--output-token", 0.66))
};
const retrievalMode = flag("--retrieval-mode", null);
const reranker = flag("--reranker", null);
const rewriteMode = flag("--rewrite", null);

const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));
const questions = only ? suite.questions.filter((question) => only.includes(question.id)) : suite.questions;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(question) {
  const started = Date.now();
  const headers = { "Content-Type": "application/json", "x-rag-eval": "1" };
  if (retrievalMode) headers["x-rag-retrieval-mode"] = retrievalMode;
  if (reranker) headers["x-rag-reranker"] = reranker;
  if (rewriteMode) headers["x-rag-rewrite"] = rewriteMode;
  const response = await fetch(`${base}/api/ai-chat`, {
    method: "POST",
    headers,
    // No history and no customer: each question is graded in isolation so one failure
    // cannot cascade into the next.
    body: JSON.stringify({ message: question, history: [], customer: {} })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
  const data = await response.json();
  return { answer: data.answer || "", matches: data.matches || [], sources: data.sources || [], action: data.action || null, ragEval: data.ragEval || null, ms: Date.now() - started };
}

function grade(question, answer) {
  const reasons = [];

  const bannedHits = question.must_not_contain.filter((banned) => contains(answer, banned));
  const regexHits = matchesAny(answer, question.must_not_match || []);

  if (question.category === "negative") {
    // A negative passes when it commits to no fabricated value AND signals uncertainty.
    if (bannedHits.length) reasons.push(`fabricated value: ${bannedHits.join(", ")}`);
    if (regexHits.length) reasons.push(`fabricated pattern: ${regexHits.join(", ")}`);
    const abstained = looksLikeAbstention(answer);
    if (!abstained && !bannedHits.length && !regexHits.length) {
      reasons.push("no abstention signal - answered as if the fact were known (review manually)");
    }
    return { pass: reasons.length === 0, reasons, abstained };
  }

  const missing = question.expected_keywords.filter((keyword) => !contains(answer, keyword));
  if (missing.length) reasons.push(`missing required fact(s): ${missing.join(" | ")}`);
  if (bannedHits.length) reasons.push(`contains wrong value(s): ${bannedHits.join(", ")}`);
  if (regexHits.length) reasons.push(`matched forbidden pattern(s): ${regexHits.join(", ")}`);

  return { pass: reasons.length === 0, reasons, abstained: missing.length > 0 && looksLikeAbstention(answer) };
}

function titleMatchesDoc(title, docFilename) {
  const stem = docFilename.replace(/\.md$/, "").replace(/^rag-/, "").replace(/[-_]/g, " ").toLowerCase();
  const normalisedTitle = String(title || "").toLowerCase().replace(/[-_]/g, " ");
  const stemWords = stem.split(" ").filter((word) => word.length > 3);
  return stemWords.length > 0 && stemWords.every((word) => normalisedTitle.includes(word));
}

function usageMetrics(usage) {
  if (!usage) return { promptTokens: null, completionTokens: null, totalTokens: null, costUsd: null };
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || promptTokens + completionTokens;
  const cached = Number(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens) || 0;
  const cacheMiss = Math.max(0, promptTokens - cached);
  const costUsd = (cached * pricing.inputCacheHit + cacheMiss * pricing.inputCacheMiss + completionTokens * pricing.output) / 1_000_000;
  return { promptTokens, completionTokens, totalTokens, costUsd };
}

function evalMetrics(question, response, graded) {
  const telemetry = response.ragEval || {};
  const chunks = Array.isArray(telemetry.retrievedChunks) ? telemetry.retrievedChunks : [];
  const context = [telemetry.catalogueFacts, telemetry.supportKnowledge, ...chunks.map((chunk) => chunk.content)].filter(Boolean).join("\n");
  const contextCoverage = question.category === "negative"
    ? null
    : question.expected_keywords.length > 0 && question.expected_keywords.every((keyword) => contains(context, keyword));
  const relevantChunkCount = question.expected_source_doc.length
    ? chunks.filter((chunk) => question.expected_source_doc.some((doc) => titleMatchesDoc(chunk.title, doc))).length
    : 0;
  const contextRelevance = question.category === "negative"
    ? null
    : chunks.length
      ? relevantChunkCount / chunks.length
      : 0;
  const faithful = question.category === "negative" ? null : graded.pass && contextCoverage;
  return {
    requestedRetrievalMode: telemetry.requestedMode || null,
    retrievalMode: telemetry.mode || null,
    rewriteMode: telemetry.rewriteMode || null,
    rerankMode: telemetry.rerankMode || null,
    candidateCount: Number(telemetry.candidateCount) || null,
    representation: telemetry.representation || null,
    retrievedChunkCount: chunks.length,
    relevantChunkCount,
    contextRelevance,
    contextCoverage,
    faithful,
    retrievalMs: Number(telemetry.retrievalMs) || null,
    generationMs: Number(telemetry.generationMs) || null,
    serverTotalMs: Number(telemetry.totalMs) || null,
    ...usageMetrics(telemetry.usage)
  };
}

console.log(`Target: ${base}/api/ai-chat`);
console.log(`Questions: ${questions.length}\n`);
console.log(`Concurrency: ${Math.min(concurrency, questions.length || 1)}\n`);

// Fail fast with a useful message rather than 50 confusing errors.
try {
  const probe = await ask("hello");
  if (!probe.answer) throw new Error("empty answer");
} catch (error) {
  console.error(`Cannot reach the app: ${error.message}`);
  console.error("Start it with `npm run dev` (or pass --base https://your-deployment).");
  process.exit(2);
}

async function evaluate(question) {
  let outcome;
  try {
    const response = await ask(question.question);
    const graded = grade(question, response.answer);
    outcome = {
      id: question.id,
      category: question.category,
      subcategory: question.subcategory,
      difficulty: question.difficulty,
      question: question.question,
      answer: response.answer,
      matchedSkus: response.matches.map((match) => match.sku),
      sources: response.sources.map((source) => source.title || source).filter(Boolean),
      latencyMs: response.ms,
      pass: graded.pass,
      abstained: graded.abstained,
      reasons: graded.reasons,
      ...evalMetrics(question, response, graded)
    };
  } catch (error) {
    outcome = {
      id: question.id, category: question.category, subcategory: question.subcategory,
      difficulty: question.difficulty, question: question.question, answer: "",
      matchedSkus: [], sources: [], latencyMs: 0, pass: false, abstained: false,
      reasons: [`request failed: ${error.message}`],
      requestedRetrievalMode: null, retrievalMode: null, retrievedChunkCount: 0, relevantChunkCount: 0,
      rewriteMode: null, rerankMode: null, candidateCount: null, representation: null,
      contextRelevance: null, contextCoverage: null, faithful: null, retrievalMs: null, generationMs: null,
      serverTotalMs: null, promptTokens: null, completionTokens: null, totalTokens: null, costUsd: null
    };
  }
  return outcome;
}

const results = new Array(questions.length);
let nextIndex = 0;
async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= questions.length) return;
    const outcome = await evaluate(questions[index]);
    results[index] = outcome;
    process.stdout.write(`${outcome.pass ? "PASS" : "FAIL"}  ${outcome.id}  ${outcome.question.slice(0, 62)}\n`);
    if (delayMs) await sleep(delayMs);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, questions.length || 1) }, worker));

const line = "-".repeat(78);
const passed = results.filter((result) => result.pass);
const pct = (count, total) => (total ? `${((count / total) * 100).toFixed(1)}%` : "n/a");

console.log(`\n${line}`);
console.log("SupplierFlow RAG - live end-to-end eval");
console.log(line);
console.log(`Overall  ${passed.length}/${results.length}  ${pct(passed.length, results.length)}`);

const groups = new Map();
for (const result of results) {
  const bucket = groups.get(result.category) || { total: 0, pass: 0 };
  bucket.total += 1;
  if (result.pass) bucket.pass += 1;
  groups.set(result.category, bucket);
}
console.log("");
for (const [name, bucket] of groups) {
  console.log(`  ${name.padEnd(16)} ${String(bucket.pass).padStart(2)}/${String(bucket.total).padEnd(3)} ${pct(bucket.pass, bucket.total)}`);
}

const negatives = results.filter((result) => result.category === "negative");
const hallucinated = negatives.filter((result) => !result.pass);
console.log("");
console.log(`Hallucination rate on unanswerable questions: ${hallucinated.length}/${negatives.length} ${pct(hallucinated.length, negatives.length)}`);

const latencies = results.map((result) => result.latencyMs).filter(Boolean).sort((a, b) => a - b);
if (latencies.length) {
  console.log(`Latency  median ${latencies[Math.floor(latencies.length / 2)]}ms  p95 ${latencies[Math.floor(latencies.length * 0.95)]}ms`);
}

function percentile(values, p) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1))];
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function ratio(count, total) {
  return total ? count / total : null;
}

function fraction(values) {
  return values.length ? average(values.map((value) => value ? 1 : 0)) : null;
}

function distribution(key) {
  const values = results
    .map((result) => result[key])
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  return { p50: percentile(values, 0.5), p95: percentile(values, 0.95), count: values.length };
}

const positiveResults = results.filter((result) => result.category !== "negative");
const correctAbstentions = negatives.filter((result) => result.pass && result.abstained);
const abstainedResults = results.filter((result) => result.abstained);
const faithfulResults = positiveResults.filter((result) => typeof result.faithful === "boolean");
const relevantContexts = positiveResults.filter((result) => Number.isFinite(result.contextRelevance));
const coveredContexts = positiveResults.filter((result) => typeof result.contextCoverage === "boolean");
const usageResults = results.filter((result) => Number.isFinite(result.totalTokens));
const phase2Metrics = {
  answerAccuracy: ratio(positiveResults.filter((result) => result.pass).length, positiveResults.length),
  passRate: ratio(passed.length, results.length),
  hallucinationRate: ratio(hallucinated.length, negatives.length),
  faithfulness: fraction(faithfulResults.map((result) => result.faithful)),
  contextRelevance: average(relevantContexts.map((result) => result.contextRelevance)),
  contextCoverage: fraction(coveredContexts.map((result) => result.contextCoverage)),
  abstentionPrecision: ratio(correctAbstentions.length, abstainedResults.length),
  abstentionRecall: ratio(correctAbstentions.length, negatives.length),
  falseAnswerRate: ratio(negatives.filter((result) => !result.abstained).length, negatives.length),
  overAbstentionRate: ratio(positiveResults.filter((result) => result.abstained).length, positiveResults.length),
  latencyMs: {
    totalClient: distribution("latencyMs"),
    serverTotal: distribution("serverTotalMs"),
    retrieval: distribution("retrievalMs"),
    generation: distribution("generationMs")
  },
  tokens: {
    measuredQueries: usageResults.length,
    prompt: usageResults.length ? usageResults.reduce((sum, result) => sum + result.promptTokens, 0) : null,
    completion: usageResults.length ? usageResults.reduce((sum, result) => sum + result.completionTokens, 0) : null,
    total: usageResults.length ? usageResults.reduce((sum, result) => sum + result.totalTokens, 0) : null,
    average: usageResults.length ? average(usageResults.map((result) => result.totalTokens)) : null
  },
  costUsd: {
    total: usageResults.length ? usageResults.reduce((sum, result) => sum + (result.costUsd || 0), 0) : null,
    averagePerQuery: usageResults.length ? average(usageResults.map((result) => result.costUsd || 0)) : null,
    pricingPerMillionTokens: pricing,
    pricingSource: "https://api-docs.deepseek.com/quick_start/pricing/"
  }
};

const fmtMetric = (value) => value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const fmtMsPair = (value) => value?.p50 == null ? "n/a" : `${Math.round(value.p50)}/${Math.round(value.p95)} ms`;
const fmtNumber = (value) => value == null ? "n/a" : value.toFixed(3);
const configModes = [...new Set(results.map((result) => result.requestedRetrievalMode).filter(Boolean))];
const observedConfig = results.find((result) => result.retrievalMode || result.rerankMode || result.rewriteMode) || {};
const configLabel = [
  retrievalMode || configModes.join(",") || observedConfig.retrievalMode || "server-default",
  reranker || observedConfig.rerankMode || "server-default",
  rewriteMode || observedConfig.rewriteMode || "server-default",
].join(" / ");
console.log("\nPhase 2 metrics (live, eval telemetry)");
console.log("| Config | Answer accuracy | Faithfulness | Context relevance | Context coverage | Abstention precision | Abstention recall | False-answer rate | Over-abstention | p50/p95 total | p50/p95 retrieval | p50/p95 generation | Avg tokens | Avg cost USD/query |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
console.log(`| ${base} / ${configLabel} | ${fmtMetric(phase2Metrics.answerAccuracy)} | ${fmtMetric(phase2Metrics.faithfulness)} | ${fmtMetric(phase2Metrics.contextRelevance)} | ${fmtMetric(phase2Metrics.contextCoverage)} | ${fmtMetric(phase2Metrics.abstentionPrecision)} | ${fmtMetric(phase2Metrics.abstentionRecall)} | ${fmtMetric(phase2Metrics.falseAnswerRate)} | ${fmtMetric(phase2Metrics.overAbstentionRate)} | ${fmtMsPair(phase2Metrics.latencyMs.totalClient)} | ${fmtMsPair(phase2Metrics.latencyMs.retrieval)} | ${fmtMsPair(phase2Metrics.latencyMs.generation)} | ${phase2Metrics.tokens.average == null ? "n/a" : Math.round(phase2Metrics.tokens.average)} | ${phase2Metrics.costUsd.averagePerQuery == null ? "n/a" : `$${phase2Metrics.costUsd.averagePerQuery.toFixed(6)}`} |`);
console.log("Faithfulness/context relevance are deterministic fixture-backed proxies, not an LLM judge.");
console.log(`Cost estimate uses ${pricing.inputCacheHit}/${pricing.inputCacheMiss}/${pricing.output} USD per million input-cache-hit/input-cache-miss/output tokens.`);

const failures = results.filter((result) => !result.pass);
if (failures.length) {
  console.log(`\n${line}`);
  console.log(`FAILURES (${failures.length})`);
  console.log(line);
  for (const failure of failures) {
    console.log(`\n[${failure.id}] ${failure.subcategory} / ${failure.difficulty}`);
    console.log(`  Q: ${failure.question}`);
    console.log(`  A: ${failure.answer.replace(/\s+/g, " ").slice(0, 300)}`);
    console.log(`  Sources: ${failure.sources.join(", ") || "(none returned)"}`);
    for (const reason of failure.reasons) console.log(`  -> ${reason}`);
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    base,
    ranAt: new Date().toISOString(),
    config: {
      requested: { retrievalMode, reranker, rewriteMode },
      observed: {
        retrievalMode: observedConfig.retrievalMode || null,
        reranker: observedConfig.rerankMode || null,
        rewriteMode: observedConfig.rewriteMode || null,
      },
    },
    metrics: {
      total: results.length,
      passed: passed.length,
      passRate: passed.length / results.length,
      hallucinationRate: negatives.length ? hallucinated.length / negatives.length : null,
      ...phase2Metrics
    },
    results
  }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}

process.exit(failures.length ? 1 : 0);
