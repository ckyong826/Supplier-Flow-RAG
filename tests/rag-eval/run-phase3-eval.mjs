// Controlled offline Phase 3 retrieval experiment.
// Measures the current keyword baseline against a second-stage reranker and document-summary
// multi-representation retrieval, then measures history-aware query rewriting separately.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contains } from "./match.mjs";
import {
  decomposeQuery,
  documentSummary,
  fuseByKeywordsWithCoverage,
  rerankByCoverage,
  rewriteQuery,
} from "../../app/api/ai-chat/retrieval.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dataDir = join(root, "data");
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const topK = Number(flag("--k", 5));
const candidateK = Number(flag("--candidates", 20));
const jsonOut = flag("--json", null);
const evaluationKs = [1, 3, 5, 10];

const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));
const followUps = JSON.parse(readFileSync(join(here, "phase3-scenarios.json"), "utf8"));

function chunkWords(text) {
  const words = text.trim().split(/\s+/);
  return Array.from({ length: Math.ceil(words.length / 100) }, (_, index) =>
    words.slice(index * 100, (index + 1) * 100).join(" ")
  ).filter(Boolean);
}

const chunks = [];
const documents = [];
for (const relative of suite.knowledge_base) {
  const name = relative.split("/").pop();
  const text = readFileSync(join(dataDir, name), "utf8");
  documents.push({ doc: name, summary: documentSummary(text) });
  chunkWords(text).forEach((content, index) => chunks.push({ doc: name, index, content }));
}

function wantedDocs(question) {
  return new Set(question.expected_source_doc.map((name) => name.split("/").pop()));
}

function retrieve(question, arm) {
  const queries = decomposeQuery(question.question || question);
  if (arm === "multi" || arm === "multi-rerank") {
    const selected = fuseByKeywordsWithCoverage(
      documents,
      queries,
      (document) => document.summary,
      Math.max(topK, queries.length),
    );
    const selectedDocs = new Set(selected.map((document) => document.doc));
    const chunkCandidates = fuseByKeywordsWithCoverage(chunks, queries, (chunk) => chunk.content, candidateK);
    const summaryCandidates = fuseByKeywordsWithCoverage(
      chunks.filter((chunk) => selectedDocs.has(chunk.doc)),
      queries,
      (chunk) => chunk.content,
      candidateK,
    );
    const candidates = fuseByKeywordsWithCoverage(
      [...summaryCandidates, ...chunkCandidates],
      queries,
      (chunk) => chunk.content,
      candidateK,
    );
    return arm === "multi-rerank"
      ? rerankByCoverage(candidates, [question.question || question, ...queries], (chunk) => chunk.content, 10)
      : candidates.slice(0, 10);
  }
  const candidates = fuseByKeywordsWithCoverage(chunks, queries, (chunk) => chunk.content, arm === "rerank" ? candidateK : 10);
  return arm === "rerank"
    ? rerankByCoverage(candidates, [question.question || question, ...queries], (chunk) => chunk.content, 10)
    : candidates.slice(0, 10);
}

function scoreAtK(question, ranked, k) {
  const wanted = wantedDocs(question);
  const selected = ranked.slice(0, k);
  const text = selected.map((chunk) => chunk.content).join("\n");
  const relevant = selected.filter((chunk) => wanted.has(chunk.doc)).length;
  return {
    hitRate: selected.some((chunk) => wanted.has(chunk.doc)),
    precision: relevant / k,
    fullyAnswerable: question.expected_keywords.length > 0 && question.expected_keywords.every((keyword) => contains(text, keyword)),
  };
}

const positive = suite.questions.filter((question) => question.category !== "negative");
const arms = ["baseline", "rerank", "multi", "multi-rerank"];
const byArm = Object.fromEntries(arms.map((arm) => [arm, positive.map((question) => ({
  id: question.id,
  metricsAtK: Object.fromEntries(evaluationKs.map((k) => [k, scoreAtK(question, retrieve(question, arm), k)])),
}))]));

const metricsByArm = Object.fromEntries(arms.map((arm) => [arm, Object.fromEntries(evaluationKs.map((k) => {
  const rows = byArm[arm].map((result) => result.metricsAtK[k]);
  return [k, {
    hitRate: rows.filter((row) => row.hitRate).length / rows.length,
    precision: rows.reduce((sum, row) => sum + row.precision, 0) / rows.length,
    fullyAnswerable: rows.filter((row) => row.fullyAnswerable).length / rows.length,
  }];
}))]));

function rewriteScore(question, text) {
  const ranked = fuseByKeywordsWithCoverage(chunks, decomposeQuery(text), (chunk) => chunk.content, 10);
  return Object.fromEntries(evaluationKs.map((k) => [k, scoreAtK(question, ranked, k)]));
}

const queryRewrite = followUps.map((scenario) => ({
  id: scenario.id,
  history: scenario.history,
  question: scenario.question,
  rewrittenQuery: rewriteQuery(scenario.question, scenario.history),
  questionOnly: rewriteScore(scenario, scenario.question),
  historyAware: rewriteScore(scenario, rewriteQuery(scenario.question, scenario.history)),
}));

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const line = "-".repeat(78);
console.log(line);
console.log(`SupplierFlow RAG - Phase 3 offline retrieval eval (top-k = ${topK}, candidates = ${candidateK})`);
console.log(line);
console.log(`Corpus: ${chunks.length} chunks across ${documents.length} documents; positives: ${positive.length}`);
console.log("\nRetrieval technique arms");
console.log("| Arm | k | Hit rate / Recall | Precision | Fully answerable |");
console.log("|---|---:|---:|---:|---:|");
for (const arm of arms) for (const k of evaluationKs) {
  const metric = metricsByArm[arm][k];
  console.log(`| ${arm} | ${k} | ${pct(metric.hitRate)} | ${pct(metric.precision)} | ${pct(metric.fullyAnswerable)} |`);
}

const rewriteAt5 = queryRewrite.map((result) => ({
  id: result.id,
  questionOnly: result.questionOnly[5],
  historyAware: result.historyAware[5],
}));
console.log("\nHistory-aware query rewrite");
console.log("| Scenario | Question-only hit | Rewritten hit | Question-only answerable | Rewritten answerable |");
console.log("|---|---:|---:|---:|---:|");
for (const result of rewriteAt5) console.log(`| ${result.id} | ${pct(result.questionOnly.hitRate ? 1 : 0)} | ${pct(result.historyAware.hitRate ? 1 : 0)} | ${pct(result.questionOnly.fullyAnswerable ? 1 : 0)} | ${pct(result.historyAware.fullyAnswerable ? 1 : 0)} |`);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    ranAt: new Date().toISOString(),
    topK,
    candidateK,
    corpus: { chunks: chunks.length, documents: documents.length },
    metricsByArm,
    byArm,
    queryRewrite,
  }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}
