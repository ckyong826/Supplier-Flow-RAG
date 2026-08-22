// Offline retrieval eval for SupplierFlow RAG.
//
// Reproduces the production path exactly:
//   - chunking matches app/api/admin/knowledge/route.ts (180-word windows)
//   - ranking uses the real decomposeQuery + fuseByKeywords from app/api/ai-chat/retrieval.mjs
//   - top-k is 3, matching the ai-chat route
//
// Measures whether the correct document reaches the context window at all. If retrieval
// fails here, no amount of LLM prompting can produce a correct answer.
//
// Run: node tests/rag-eval/run-retrieval-eval.mjs [--k 3] [--json out.json]

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decomposeQuery, fuseByKeywords } from "../../app/api/ai-chat/retrieval.mjs";
import { contains } from "./match.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dataDir = join(root, "data");

const args = process.argv.slice(2);
const topK = Number(args[args.indexOf("--k") + 1]) || 3;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));

// Mirrors chunks() in app/api/admin/knowledge/route.ts
function chunkWords(text) {
  const words = text.trim().split(/\s+/);
  return Array.from({ length: Math.ceil(words.length / 180) }, (_, index) =>
    words.slice(index * 180, (index + 1) * 180).join(" ")
  ).filter(Boolean);
}

const chunks = [];
for (const relative of suite.knowledge_base) {
  const name = relative.split("/").pop();
  const text = readFileSync(join(dataDir, name), "utf8");
  chunkWords(text).forEach((content, index) => {
    chunks.push({ doc: name, index, content });
  });
}

const docChunkCounts = chunks.reduce((counts, chunk) => {
  counts[chunk.doc] = (counts[chunk.doc] || 0) + 1;
  return counts;
}, {});

function retrieve(question) {
  const queries = decomposeQuery(question);
  return fuseByKeywords(chunks, queries, (chunk) => chunk.content);
}

const results = [];

for (const question of suite.questions) {
  const ranked = retrieve(question.question);
  const top = ranked.slice(0, topK);
  const wanted = new Set(question.expected_source_doc.map((name) => name.split("/").pop()));

  // Rank (1-based) of the first chunk from an expected document.
  let rankOfFirstHit = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    if (wanted.has(ranked[index].doc)) { rankOfFirstHit = index + 1; break; }
  }

  // For multi-doc questions, how many of the required documents made top-k.
  const docsInTopK = new Set(top.filter((chunk) => wanted.has(chunk.doc)).map((chunk) => chunk.doc));

  // Does the top-k text actually contain the answer keywords? Retrieval can hit the right
  // document but the wrong 180-word window - this catches that.
  const topText = top.map((chunk) => chunk.content).join("\n");
  const keywordsPresent = question.expected_keywords.filter((keyword) => contains(topText, keyword));
  const answerable = question.expected_keywords.length > 0 && keywordsPresent.length === question.expected_keywords.length;

  let status;
  if (question.category === "negative") {
    // Negatives have no correct document. Retrieval will still return something (keyword
    // overlap is never zero for a plausible question); that is expected and not a failure.
    // What matters is that generation abstains - measured by the live runner. Here we only
    // record what context the model would be handed.
    status = "n/a";
  } else if (!rankOfFirstHit) {
    status = "miss";
  } else if (docsInTopK.size < wanted.size) {
    status = "partial";
  } else if (!answerable) {
    status = "wrong-chunk";
  } else {
    status = "hit";
  }

  results.push({
    id: question.id,
    category: question.category,
    subcategory: question.subcategory,
    difficulty: question.difficulty,
    question: question.question,
    status,
    rankOfFirstHit,
    reciprocalRank: rankOfFirstHit ? 1 / rankOfFirstHit : 0,
    expectedDocs: [...wanted],
    docsFoundInTopK: [...docsInTopK],
    retrievedTopK: top.map((chunk) => `${chunk.doc}#${chunk.index}`),
    missingKeywords: question.expected_keywords.filter((keyword) => !keywordsPresent.includes(keyword))
  });
}

const scored = results.filter((result) => result.status !== "n/a");
const hits = scored.filter((result) => result.status === "hit");
const at1 = scored.filter((result) => result.rankOfFirstHit === 1);
const inTopK = scored.filter((result) => result.rankOfFirstHit > 0 && result.rankOfFirstHit <= topK);
const mrr = scored.reduce((sum, result) => sum + result.reciprocalRank, 0) / scored.length;

function pct(count, total) { return `${((count / total) * 100).toFixed(1)}%`; }

const line = "-".repeat(78);
console.log(line);
console.log(`SupplierFlow RAG - offline retrieval eval (top-k = ${topK})`);
console.log(line);
console.log(`Corpus: ${chunks.length} chunks across ${Object.keys(docChunkCounts).length} documents`);
for (const [doc, count] of Object.entries(docChunkCounts)) console.log(`  ${String(count).padStart(3)} chunk(s)  ${doc}`);
console.log("");
console.log(`Scored questions (positives): ${scored.length}`);
console.log(`  Recall@1        ${String(at1.length).padStart(3)}/${scored.length}  ${pct(at1.length, scored.length)}   correct doc ranked first`);
console.log(`  Recall@${topK}        ${String(inTopK.length).padStart(3)}/${scored.length}  ${pct(inTopK.length, scored.length)}   correct doc anywhere in context`);
console.log(`  Fully answerable ${String(hits.length).padStart(2)}/${scored.length}  ${pct(hits.length, scored.length)}   every expected fact present in top-${topK} text`);
console.log(`  MRR             ${mrr.toFixed(3)}`);
console.log("");

const breakdown = (key) => {
  const groups = new Map();
  for (const result of scored) {
    const bucket = groups.get(result[key]) || { total: 0, hit: 0 };
    bucket.total += 1;
    if (result.status === "hit") bucket.hit += 1;
    groups.set(result[key], bucket);
  }
  return groups;
};

console.log("By category:");
for (const [name, bucket] of breakdown("category")) {
  console.log(`  ${name.padEnd(16)} ${String(bucket.hit).padStart(2)}/${String(bucket.total).padEnd(3)} ${pct(bucket.hit, bucket.total)}`);
}
console.log("");
console.log("By difficulty:");
for (const [name, bucket] of breakdown("difficulty")) {
  console.log(`  ${name.padEnd(16)} ${String(bucket.hit).padStart(2)}/${String(bucket.total).padEnd(3)} ${pct(bucket.hit, bucket.total)}`);
}

const failures = scored.filter((result) => result.status !== "hit");
if (failures.length) {
  console.log("");
  console.log(line);
  console.log(`FAILURES (${failures.length})`);
  console.log(line);
  for (const failure of failures) {
    console.log(`\n[${failure.id}] ${failure.status.toUpperCase()}  (${failure.subcategory}, ${failure.difficulty})`);
    console.log(`  Q: ${failure.question}`);
    console.log(`  expected doc(s): ${failure.expectedDocs.join(", ")}`);
    console.log(`  retrieved top-${topK}: ${failure.retrievedTopK.join(", ") || "(nothing)"}`);
    if (failure.rankOfFirstHit) console.log(`  first correct chunk at rank ${failure.rankOfFirstHit}`);
    if (failure.missingKeywords.length) console.log(`  facts absent from retrieved text: ${failure.missingKeywords.join(", ")}`);
  }
}

console.log("");
console.log(line);
console.log(`Negative questions (${results.length - scored.length}) are not scored here - abstention is a generation`);
console.log("behaviour. Run run-live-eval.mjs to grade those.");
console.log(line);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({
    topK,
    corpus: { chunks: chunks.length, byDocument: docChunkCounts },
    metrics: {
      scored: scored.length,
      recallAt1: at1.length / scored.length,
      recallAtK: inTopK.length / scored.length,
      fullyAnswerable: hits.length / scored.length,
      mrr
    },
    results
  }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}
