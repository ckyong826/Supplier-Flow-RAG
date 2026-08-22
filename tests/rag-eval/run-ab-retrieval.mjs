// A/B retrieval comparison: keyword vs vector vs hybrid on the same 50 questions.
//
// Unlike run-retrieval-eval.mjs (pure offline, reads data/*.md), this hits the real Supabase
// corpus so the vector path exercises the actual embeddings you backfilled. It does NOT need
// the dev server or DeepSeek - it stops at retrieval, which keeps the comparison deterministic
// and free of generation noise.
//
// Query embeddings are cached to disk, so re-running costs nothing after the first pass.
//
// Usage:
//   node tests/rag-eval/run-ab-retrieval.mjs                      # all three modes
//   node tests/rag-eval/run-ab-retrieval.mjs --modes keyword,vector
//   node tests/rag-eval/run-ab-retrieval.mjs --k 5 --min-similarity 0.35
//   node tests/rag-eval/run-ab-retrieval.mjs --json tests/rag-eval/results-ab.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decomposeQuery } from "../../app/api/ai-chat/retrieval.mjs";
import { keywordSearch, vectorSearch, retrieveKnowledge, DEFAULT_MIN_SIMILARITY } from "../../app/api/ai-chat/knowledge-retrieval.mjs";
import { contains } from "./match.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const topK = Number(flag("--k", 3));
const minSimilarity = Number(flag("--min-similarity", DEFAULT_MIN_SIMILARITY));
const modes = flag("--modes", "keyword,vector,hybrid").split(",").map((mode) => mode.trim());
const jsonOut = flag("--json", null);

const suite = JSON.parse(readFileSync(join(here, "rag-eval-questions.json"), "utf8"));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

async function supabase(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response;
}

// Disk-cached query embeddings: the eval is meant to be re-run after every retrieval tweak,
// and re-paying for 50 identical embeddings each time is pure waste.
const cacheDir = join(here, ".cache");
const cachePath = join(cacheDir, "query-embeddings.json");
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
let cacheHits = 0;
let cacheMisses = 0;

async function cachedEmbed(text) {
  if (cache[text]) { cacheHits += 1; return cache[text]; }
  cacheMisses += 1;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const vector = (await response.json()).data[0].embedding;
  cache[text] = vector;
  return vector;
}

function saveCache() {
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
}

// Preflight: a corpus with null embeddings silently makes vector mode look terrible.
if (modes.includes("vector") || modes.includes("hybrid")) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required for vector/hybrid modes.");
    process.exit(2);
  }
  const rows = await (await supabase("knowledge_chunks?select=id,embedding")).json();
  const embedded = rows.filter((row) => row.embedding !== null).length;
  console.log(`Corpus: ${rows.length} chunk(s), ${embedded} embedded`);
  if (embedded === 0) {
    console.error("\nNo chunk has an embedding. Run: node scripts/backfill-embeddings.mjs");
    process.exit(2);
  }
  if (embedded < rows.length) {
    console.warn(`\nWARNING: ${rows.length - embedded} chunk(s) have no embedding and are invisible to vector search.`);
    console.warn("Vector results below understate real performance. Run the backfill first.\n");
  }
}

// The corpus stores document titles, not filenames. Map expected_source_doc onto titles by
// matching the filename stem against the title, so the fixture stays filename-based.
function titleMatchesDoc(title, docFilename) {
  const stem = docFilename.replace(/\.md$/, "").replace(/^rag-/, "").replace(/[-_]/g, " ").toLowerCase();
  const normalisedTitle = title.toLowerCase().replace(/[-_]/g, " ");
  const stemWords = stem.split(" ").filter((word) => word.length > 3);
  return stemWords.length > 0 && stemWords.every((word) => normalisedTitle.includes(word));
}

// Preflight the title mapping. If a fixture document maps to no title in the corpus, every
// question citing it scores 0 and the mode looks broken when the real problem is a naming
// mismatch. Fail loudly instead.
{
  const documents = await (await supabase("knowledge_documents?select=title")).json();
  const titles = documents.map((document) => document.title);
  const expectedDocs = [...new Set(suite.questions.flatMap((question) => question.expected_source_doc.map((name) => name.split("/").pop())))];
  const unmapped = expectedDocs.filter((doc) => !titles.some((title) => titleMatchesDoc(title, doc)));
  if (unmapped.length) {
    console.error("\nThese fixture documents match no knowledge_documents.title in Supabase:");
    for (const doc of unmapped) console.error(`  - ${doc}`);
    console.error("\nTitles currently in the corpus:");
    for (const title of titles) console.error(`  - ${title}`);
    console.error("\nRe-upload with titles matching the filenames, or adjust titleMatchesDoc().");
    process.exit(2);
  }
  console.log(`Title mapping OK: ${expectedDocs.length} fixture document(s) resolved against ${titles.length} corpus title(s).\n`);
}

async function retrieveFor(mode, question) {
  const queries = decomposeQuery(question);
  if (mode === "keyword") return keywordSearch({ supabase, queries, limit: topK });
  if (mode === "vector") return vectorSearch({ supabase, question, limit: topK, minSimilarity, embed: cachedEmbed });
  const result = await retrieveKnowledge({ supabase, question, queries, limit: topK, mode: "hybrid", minSimilarity, embed: cachedEmbed });
  return result.chunks;
}

function score(question, chunks) {
  const wanted = question.expected_source_doc.map((name) => name.split("/").pop());
  let rank = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    if (wanted.some((doc) => titleMatchesDoc(chunks[index].title, doc))) { rank = index + 1; break; }
  }
  const text = chunks.map((chunk) => chunk.content).join("\n");
  const missing = question.expected_keywords.filter((keyword) => !contains(text, keyword));
  return {
    rank,
    answerable: question.expected_keywords.length > 0 && missing.length === 0,
    missing,
    retrieved: chunks.map((chunk) => ({ title: chunk.title, similarity: chunk.similarity })),
    returnedNothing: chunks.length === 0
  };
}

const byMode = {};
for (const mode of modes) {
  const results = [];
  for (const question of suite.questions) {
    try {
      const chunks = await retrieveFor(mode, question.question);
      results.push({ id: question.id, category: question.category, difficulty: question.difficulty, ...score(question, chunks) });
    } catch (error) {
      results.push({ id: question.id, category: question.category, difficulty: question.difficulty, rank: 0, answerable: false, missing: [], retrieved: [], returnedNothing: true, error: String(error) });
    }
  }
  byMode[mode] = results;
  saveCache();
  process.stdout.write(`${mode} done\n`);
}

const positives = suite.questions.filter((question) => question.category !== "negative").map((question) => question.id);
const negatives = suite.questions.filter((question) => question.category === "negative").map((question) => question.id);
const pct = (count, total) => (total ? `${((count / total) * 100).toFixed(1)}%` : "n/a");
const line = "-".repeat(78);

console.log(`\n${line}`);
console.log(`Retrieval A/B  (top-k = ${topK}, min similarity = ${minSimilarity})`);
console.log(line);
console.log(`Query embeddings: ${cacheHits} cached, ${cacheMisses} fetched\n`);

console.log(`${"mode".padEnd(10)} ${"Recall@1".padEnd(10)} ${`Recall@${topK}`.padEnd(10)} ${"Answerable".padEnd(12)} ${"MRR".padEnd(7)} Abstained`);
console.log(line);
for (const mode of modes) {
  const results = byMode[mode];
  const pos = results.filter((result) => positives.includes(result.id));
  const neg = results.filter((result) => negatives.includes(result.id));
  const at1 = pos.filter((result) => result.rank === 1).length;
  const atK = pos.filter((result) => result.rank > 0).length;
  const answerable = pos.filter((result) => result.answerable).length;
  const mrr = pos.reduce((sum, result) => sum + (result.rank ? 1 / result.rank : 0), 0) / pos.length;
  // For negatives, returning nothing is the desired retrieval behaviour: it lets the route
  // tell the model there is no supporting document instead of handing over weak context.
  const abstained = neg.filter((result) => result.returnedNothing).length;
  console.log(
    `${mode.padEnd(10)} ${pct(at1, pos.length).padEnd(10)} ${pct(atK, pos.length).padEnd(10)} ` +
    `${pct(answerable, pos.length).padEnd(12)} ${mrr.toFixed(3).padEnd(7)} ${abstained}/${neg.length}`
  );
}

// Per-question deltas are where the real decision lives: an aggregate tie can hide one mode
// winning the near-duplicate SKU cases and losing every paraphrased policy question.
if (modes.length >= 2) {
  const [left, right] = modes;
  const flips = suite.questions
    .filter((question) => question.category !== "negative")
    .map((question) => {
      const leftResult = byMode[left].find((result) => result.id === question.id);
      const rightResult = byMode[right].find((result) => result.id === question.id);
      return { id: question.id, subcategory: question.subcategory, leftOk: leftResult.answerable, rightOk: rightResult.answerable };
    })
    .filter((flip) => flip.leftOk !== flip.rightOk);

  console.log(`\n${line}`);
  console.log(`Where ${left} and ${right} disagree (${flips.length} question(s))`);
  console.log(line);
  if (!flips.length) console.log("  No disagreement on answerability.");
  for (const flip of flips) {
    const winner = flip.rightOk ? right : left;
    console.log(`  ${flip.id.padEnd(5)} ${winner.padEnd(8)} wins   (${flip.subcategory})`);
  }
}

console.log(`\n${line}`);
console.log("Abstained = retrieval returned zero chunks for an unanswerable question.");
console.log("Keyword mode cannot abstain by design: term overlap is never exactly zero, so it");
console.log("always hands the model something. Only the vector similarity floor can return");
console.log("nothing, which is why it matters for N01-N10.");
console.log(line);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ topK, minSimilarity, modes, ranAt: new Date().toISOString(), byMode }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}
