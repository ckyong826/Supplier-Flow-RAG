// Live Phase 3 checks for history-aware rewriting and the optional HyDE arm.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contains } from "./match.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = flag("--base", process.env.EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const jsonOut = flag("--json", null);
const scenarios = JSON.parse(readFileSync(join(here, "phase3-scenarios.json"), "utf8"));

async function ask(scenario, rewrite, retrievalMode = "keyword") {
  const response = await fetch(`${base}/api/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rag-eval": "1",
      "x-rag-rewrite": rewrite,
      "x-rag-retrieval-mode": retrievalMode,
    },
    body: JSON.stringify({
      message: scenario.question,
      history: scenario.history ? [{ role: "user", content: scenario.history }] : [],
      customer: {},
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

function grade(scenario, data) {
  const missing = scenario.expected_keywords.filter((keyword) => !contains(data.answer || "", keyword));
  return { pass: missing.length === 0, missing };
}

const rows = [];
for (const scenario of scenarios) {
  const [questionOnly, historyAware] = await Promise.all([
    ask(scenario, "none"),
    ask(scenario, "history"),
  ]);
  rows.push({
    id: scenario.id,
    question: scenario.question,
    questionOnly: grade(scenario, questionOnly),
    historyAware: grade(scenario, historyAware),
    rewrittenQuery: historyAware.ragEval?.retrievalQuestion || null,
    questionOnlyTelemetry: questionOnly.ragEval || null,
    historyAwareTelemetry: historyAware.ragEval || null,
  });
}

const pct = (count, total) => total ? `${((count / total) * 100).toFixed(1)}%` : "n/a";
const questionOnlyPass = rows.filter((row) => row.questionOnly.pass).length;
const historyAwarePass = rows.filter((row) => row.historyAware.pass).length;
console.log(`Target: ${base}/api/ai-chat`);
console.log("\nHistory-aware query rewrite (live)");
console.log("| Scenario | Question-only | History-aware | Rewritten query |");
console.log("|---|---:|---:|---|");
for (const row of rows) console.log(`| ${row.id} | ${row.questionOnly.pass ? "PASS" : "FAIL"} | ${row.historyAware.pass ? "PASS" : "FAIL"} | ${(row.rewrittenQuery || "").replace(/\|/g, "\\|")} |`);
console.log(`\nQuestion-only: ${questionOnlyPass}/${rows.length} ${pct(questionOnlyPass, rows.length)}`);
console.log(`History-aware: ${historyAwarePass}/${rows.length} ${pct(historyAwarePass, rows.length)}`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    ranAt: new Date().toISOString(),
    base,
    metrics: {
      scenarios: rows.length,
      questionOnlyPass,
      historyAwarePass,
      questionOnlyRate: questionOnlyPass / rows.length,
      historyAwareRate: historyAwarePass / rows.length,
    },
    rows,
  }, null, 2) + "\n");
  console.log(`Wrote ${jsonOut}`);
}

process.exit(historyAwarePass === rows.length ? 0 : 1);
