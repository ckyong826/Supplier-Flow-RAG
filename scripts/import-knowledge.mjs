// Imports the knowledge-base markdown files in data/ into Supabase.
//
// This is the missing first step. The files in data/ are just files on disk - the chat
// endpoint reads from the knowledge_documents / knowledge_chunks tables, so until they are
// imported the bot has no support knowledge at all and every policy question fails.
//
// Does ingest and embedding in one pass, so for a fresh corpus you do NOT also need
// backfill-embeddings.mjs (that one exists for rows imported before the key was available).
//
// Titles are derived from filenames, which is what keeps the A/B harness's document mapping
// working. Don't rename them by hand without checking titleMatchesDoc() in run-ab-retrieval.mjs.
//
// Usage:
//   node scripts/import-knowledge.mjs --dry-run     # show what would be imported
//   node scripts/import-knowledge.mjs               # import (skips docs already present)
//   node scripts/import-knowledge.mjs --replace     # delete and re-import existing docs
//   node scripts/import-knowledge.mjs --no-embed    # text only, keyword retrieval only
//   node scripts/import-knowledge.mjs --include-sources   # also index the URL manifest

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dataDir = join(root, "data");

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

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_WORDS = 100;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const replace = args.includes("--replace");
const noEmbed = args.includes("--no-embed");
const includeSources = args.includes("--include-sources");
const metricsOut = args.includes("--metrics") ? args[args.indexOf("--metrics") + 1] : null;
const importStarted = Date.now();

// The retrieval eval found this file outranking the real answer document on every product
// question: it is a list of source URLs, and the URLs contain the SKUs, so keyword scoring
// counts each code many times. It carries no answers the official knowledge file lacks
// (except the Type 3 SPD / 10 m rule - move that across before relying on this default).
const EXCLUDED_BY_DEFAULT = ["rag-benchmark-sources.md"];

// knowledge_documents.source_type is constrained to these four values.
const SOURCE_TYPES = {
  "supplierflow-official-knowledge.md": "datasheet",
  "rag-benchmark-sources.md": "datasheet",
  "rag-delivery-policy.md": "policy",
  "rag-payment-terms.md": "policy",
  "rag-warranty-policy.md": "policy",
  "rag-sales-sop.md": "sop",
  "reference-mcb-tripping-curves.md": "faq",
  "reference-rccb-current-types.md": "faq",
  "reference-spd-selection.md": "faq",
  "reference-tesys-auxiliary-contacts.md": "faq",
  "reference-incoterms-2020.md": "policy",
  "reference-mcb-current-limiting.md": "faq",
  "reference-rccb-installation-systems.md": "faq",
  "reference-rccb-operating-conditions.md": "faq",
  "reference-tesys-linked-contacts.md": "faq",
  "reference-incoterms-cost-insurance.md": "policy",
  "reference-malaysia-sst-scope.md": "policy",
  "reference-malaysia-hs-explorer.md": "policy",
  "reference-mcb-selectivity.md": "faq",
  "reference-tesys-utilization-categories.md": "faq",
  "reference-spd-electrical-characteristics.md": "faq",
  "reference-spd-connection-rules.md": "faq",
  "reference-rccb-selective-types.md": "faq",
  "reference-rccb-selectivity-coordination.md": "faq",
  "reference-mcb-temperature-derating.md": "faq",
  "reference-mcb-dc-applications.md": "faq",
  "reference-rccb-overcurrent-protection.md": "faq",
  "reference-rccb-type-f.md": "faq",
  "reference-tesys-dc-coil.md": "faq",
  "reference-spd-impulse-current.md": "faq",
  "reference-incoterms-risk-transfer.md": "policy",
  "reference-acti9-ic60-catalogue.md": "faq",
  "reference-acti9-rcbo-catalogue.md": "faq",
  "reference-acti9-iprd-catalogue.md": "faq",
  "reference-acti9-iprd-brochure.md": "faq",
  "reference-tesys-deca-catalogue.md": "faq",
  "reference-tesys-overload-relays.md": "faq",
  "reference-abb-s200-catalogue.md": "faq",
  "reference-abb-f200-b-type.md": "faq",
  "reference-abb-rcd-application.md": "faq",
  "reference-eaton-pf7-catalogue.md": "faq",
  "reference-eaton-pln6-catalogue.md": "faq",
  "reference-incoterms-rules-overview.md": "policy"
};

// "rag-delivery-policy.md" -> "Delivery Policy"
function titleFor(filename) {
  return filename
    .replace(/\.md$/, "")
    .replace(/^rag-/, "")
    .split("-")
    .map((word) => (word === "sop" ? "SOP" : word === "supplierflow" ? "SupplierFlow" : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

function chunkWords(text) {
  const words = text.trim().split(/\s+/);
  return Array.from({ length: Math.ceil(words.length / CHUNK_WORDS) }, (_, index) =>
    words.slice(index * CHUNK_WORDS, (index + 1) * CHUNK_WORDS).join(" ")
  ).filter(Boolean);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}
if (!noEmbed && !openaiKey && !dryRun) {
  console.error("OPENAI_API_KEY is required unless you pass --no-embed.");
  console.error("Without embeddings only keyword retrieval will work.");
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

async function embedAll(texts) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (data.data.length !== texts.length) throw new Error(`Expected ${texts.length} embeddings, got ${data.data.length}`);
  // Sort by index rather than trusting response order: a silent misalignment would attach
  // every embedding to the wrong chunk and be very hard to notice later.
  return data.data.slice().sort((left, right) => left.index - right.index).map((item) => {
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Model returned ${item.embedding.length} dimensions, schema expects ${EMBEDDING_DIMENSIONS}`);
    }
    return item.embedding;
  });
}

const files = readdirSync(dataDir)
  .filter((name) => name.endsWith(".md"))
  .filter((name) => includeSources || !EXCLUDED_BY_DEFAULT.includes(name))
  .sort();

const skipped = readdirSync(dataDir).filter((name) => name.endsWith(".md") && !files.includes(name));

console.log(`Target: ${supabaseUrl}`);
console.log(`Source: ${dataDir}`);
console.log(`Embedding: ${noEmbed ? "disabled (--no-embed)" : `${EMBEDDING_MODEL}, ${EMBEDDING_DIMENSIONS}d`}\n`);

if (skipped.length) {
  console.log("Excluded from the index (pass --include-sources to override):");
  for (const name of skipped) console.log(`  - ${name}  (URL manifest; inflates keyword scores, carries no unique answers)`);
  console.log("");
}

const existing = await (await supabase("knowledge_documents?select=id,title")).json();
const existingByTitle = new Map(existing.map((document) => [document.title, document.id]));

const plan = files.map((name) => {
  const text = readFileSync(join(dataDir, name), "utf8");
  const title = titleFor(name);
  return {
    name,
    title,
    sourceType: SOURCE_TYPES[name] || "policy",
    text,
    chunks: chunkWords(text),
    existingId: existingByTitle.get(title) || null
  };
});

const plannedTitles = new Set(plan.map((item) => item.title));
const staleDocuments = existing.filter((document) => !plannedTitles.has(document.title));
const sourceBytes = plan.reduce((sum, item) => sum + Buffer.byteLength(item.text, "utf8"), 0);
const plannedChunkTextBytes = plan.reduce(
  (sum, item) => sum + item.chunks.reduce((itemSum, chunk) => itemSum + Buffer.byteLength(chunk, "utf8"), 0),
  0,
);
if (staleDocuments.length) {
  console.log("Existing database documents outside the source set:");
  for (const document of staleDocuments) console.log(`  - ${document.title}`);
  console.log("");
}

console.log(`${"file".padEnd(38)} ${"title".padEnd(30)} ${"type".padEnd(10)} chunks  status`);
console.log("-".repeat(104));
for (const item of plan) {
  const status = !item.existingId ? "new" : replace ? "will replace" : "SKIP (already present)";
  console.log(`${item.name.padEnd(38)} ${item.title.padEnd(30)} ${item.sourceType.padEnd(10)} ${String(item.chunks.length).padStart(6)}  ${status}`);
}

const todo = plan.filter((item) => !item.existingId || replace);
const totalChunks = todo.reduce((sum, item) => sum + item.chunks.length, 0);
console.log("-".repeat(104));
console.log(`${todo.length} document(s), ${totalChunks} chunk(s) to import.`);

if (dryRun) {
  console.log("\nDry run - nothing written.");
  if (metricsOut) {
    mkdirSync(dirname(metricsOut), { recursive: true });
    writeFileSync(metricsOut, JSON.stringify({
      ranAt: new Date().toISOString(),
      status: "dry-run",
      documents: files.length,
      chunks: plan.reduce((sum, item) => sum + item.chunks.length, 0),
      embeddedChunks: null,
      embeddingDimensions: noEmbed ? null : EMBEDDING_DIMENSIONS,
      sourceBytes,
      plannedChunkTextBytes,
      indexBuildMs: null,
      elapsedMs: Date.now() - importStarted,
      staleDocuments: staleDocuments.map((document) => document.title),
    }, null, 2) + "\n");
    console.log(`Wrote ${metricsOut}`);
  }
  process.exit(0);
}
if (!todo.length) {
  console.log("\nNothing to do. Use --replace to re-import documents that already exist.");
  if (metricsOut) {
    mkdirSync(dirname(metricsOut), { recursive: true });
    writeFileSync(metricsOut, JSON.stringify({
      ranAt: new Date().toISOString(),
      status: "no-op",
      documents: files.length,
      chunks: null,
      embeddedChunks: null,
      embeddingDimensions: noEmbed ? null : EMBEDDING_DIMENSIONS,
      sourceBytes,
      plannedChunkTextBytes,
      indexBuildMs: 0,
      elapsedMs: Date.now() - importStarted,
      staleDocuments: staleDocuments.map((document) => document.title),
    }, null, 2) + "\n");
    console.log(`Wrote ${metricsOut}`);
  }
  process.exit(0);
}

console.log("");
for (const item of todo) {
  if (item.existingId) {
    // Chunks cascade on delete, so this removes the old chunks too.
    await supabase(`knowledge_documents?id=eq.${item.existingId}`, { method: "DELETE" });
    console.log(`  removed old "${item.title}"`);
  }

  const [document] = await (await supabase("knowledge_documents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ title: item.title, source_type: item.sourceType, content: item.text })
  })).json();

  const vectors = noEmbed ? [] : await embedAll(item.chunks);

  await supabase("knowledge_chunks", {
    method: "POST",
    body: JSON.stringify(item.chunks.map((content, index) => ({
      document_id: document.id,
      chunk_index: index,
      content,
      embedding: vectors[index] || null
    })))
  });

  console.log(`  imported "${item.title}" - ${item.chunks.length} chunk(s)${noEmbed ? "" : ", embedded"}`);
}

const after = await (await supabase("knowledge_chunks?select=id,embedding,content")).json();
const embedded = after.filter((row) => row.embedding !== null).length;
const indexedChunkTextBytes = after.reduce((sum, row) => sum + Buffer.byteLength(row.content || "", "utf8"), 0);

console.log(`\nCorpus now: ${after.length} chunk(s), ${embedded} embedded.`);
if (embedded < after.length) {
  console.log(`${after.length - embedded} chunk(s) have no embedding and are invisible to vector search.`);
  console.log("Run: node scripts/backfill-embeddings.mjs");
}
if (metricsOut) {
  mkdirSync(dirname(metricsOut), { recursive: true });
  writeFileSync(metricsOut, JSON.stringify({
    ranAt: new Date().toISOString(),
    status: "imported",
    documents: files.length,
    importedDocuments: todo.length,
    chunks: after.length,
    embeddedChunks: embedded,
    embeddingDimensions: noEmbed ? null : EMBEDDING_DIMENSIONS,
    sourceBytes,
    plannedChunkTextBytes,
    indexedChunkTextBytes,
    indexBuildMs: Date.now() - importStarted,
    elapsedMs: Date.now() - importStarted,
    staleDocuments: staleDocuments.map((document) => document.title),
  }, null, 2) + "\n");
  console.log(`Wrote ${metricsOut}`);
}
console.log("\nNext: node tests/rag-eval/run-ab-retrieval.mjs");
