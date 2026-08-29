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

const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));
const questions = only ? suite.questions.filter((question) => only.includes(question.id)) : suite.questions;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(question) {
  const started = Date.now();
  const response = await fetch(`${base}/api/ai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No history and no customer: each question is graded in isolation so one failure
    // cannot cascade into the next.
    body: JSON.stringify({ message: question, history: [], customer: {} })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
  const data = await response.json();
  return { answer: data.answer || "", matches: data.matches || [], sources: data.sources || [], action: data.action || null, ms: Date.now() - started };
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

  return { pass: reasons.length === 0, reasons, abstained: looksLikeAbstention(answer) };
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
      reasons: graded.reasons
    };
  } catch (error) {
    outcome = {
      id: question.id, category: question.category, subcategory: question.subcategory,
      difficulty: question.difficulty, question: question.question, answer: "",
      matchedSkus: [], sources: [], latencyMs: 0, pass: false, abstained: false,
      reasons: [`request failed: ${error.message}`]
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
    metrics: {
      total: results.length,
      passed: passed.length,
      passRate: passed.length / results.length,
      hallucinationRate: negatives.length ? hallucinated.length / negatives.length : null
    },
    results
  }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}

process.exit(failures.length ? 1 : 0);
