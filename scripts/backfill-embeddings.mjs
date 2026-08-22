// Backfills embeddings for knowledge_chunks rows inserted before OPENAI_API_KEY was set.
//
// Those rows have embedding = NULL, which makes them invisible to match_knowledge_chunks
// (it filters `where c.embedding is not null`). Setting the key only affects new uploads, so
// without this the corpus stays unsearchable by vector even though the key is present.
//
// Idempotent: only touches rows where embedding is null, so re-running is safe.
//
// Usage:
//   node scripts/backfill-embeddings.mjs --dry-run    # report coverage, embed nothing
//   node scripts/backfill-embeddings.mjs              # backfill
//   node scripts/backfill-embeddings.mjs --force      # re-embed everything (model change)
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in the environment
// (or a .env file in the project root, which this script loads itself).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Minimal .env loader so the script works with plain `node`, no extra dependency.
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
const BATCH_SIZE = 64;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

const missing = [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ...(dryRun ? [] : [["OPENAI_API_KEY", openaiKey]])
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
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

async function embedBatch(texts) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = await response.json();
  // The API preserves input order, but assert rather than trust - a misalignment here would
  // attach every embedding to the wrong chunk and be nearly invisible afterwards.
  if (data.data.length !== texts.length) throw new Error(`Expected ${texts.length} embeddings, got ${data.data.length}`);
  return data.data
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((item) => {
      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Model returned ${item.embedding.length} dimensions, schema expects ${EMBEDDING_DIMENSIONS}`);
      }
      return item.embedding;
    });
}

async function coverage() {
  const documents = await (await supabase("knowledge_documents?select=id,title&order=title")).json();
  const report = [];
  for (const document of documents) {
    const rows = await (await supabase(`knowledge_chunks?select=id,embedding&document_id=eq.${document.id}`)).json();
    report.push({
      title: document.title,
      total: rows.length,
      embedded: rows.filter((row) => row.embedding !== null).length
    });
  }
  return report;
}

function printCoverage(report) {
  const width = Math.max(20, ...report.map((row) => row.title.length));
  console.log(`${"document".padEnd(width)}  embedded / total`);
  console.log("-".repeat(width + 20));
  for (const row of report) {
    const flag = row.embedded === row.total ? "" : "   <-- incomplete";
    console.log(`${row.title.padEnd(width)}  ${String(row.embedded).padStart(8)} / ${String(row.total).padEnd(5)}${flag}`);
  }
  const total = report.reduce((sum, row) => sum + row.total, 0);
  const embedded = report.reduce((sum, row) => sum + row.embedded, 0);
  console.log("-".repeat(width + 20));
  console.log(`${"TOTAL".padEnd(width)}  ${String(embedded).padStart(8)} / ${String(total).padEnd(5)}`);
  return { total, embedded };
}

console.log(`Target: ${supabaseUrl}`);
console.log(`Model:  ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dimensions)\n`);

console.log("Coverage before:");
const before = printCoverage(await coverage());

if (dryRun) {
  const pending = before.total - before.embedded;
  console.log(`\nDry run. ${pending} chunk(s) would be embedded.`);
  process.exit(0);
}

const filter = force ? "" : "&embedding=is.null";
const pending = await (await supabase(`knowledge_chunks?select=id,content&order=document_id,chunk_index${filter}`)).json();

if (!pending.length) {
  console.log("\nNothing to do - every chunk already has an embedding.");
  process.exit(0);
}

console.log(`\nEmbedding ${pending.length} chunk(s) in batches of ${BATCH_SIZE}...`);

let done = 0;
for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const batch = pending.slice(offset, offset + BATCH_SIZE);
  const vectors = await embedBatch(batch.map((chunk) => chunk.content));
  // PATCH one row at a time: a bulk upsert here would need the full row and risks clobbering
  // content if anything is stale.
  for (let index = 0; index < batch.length; index += 1) {
    await supabase(`knowledge_chunks?id=eq.${batch[index].id}`, {
      method: "PATCH",
      body: JSON.stringify({ embedding: vectors[index] })
    });
    done += 1;
  }
  console.log(`  ${done}/${pending.length}`);
}

console.log("\nCoverage after:");
const after = printCoverage(await coverage());

if (after.embedded !== after.total) {
  console.log(`\nWARNING: ${after.total - after.embedded} chunk(s) still have no embedding.`);
  process.exit(1);
}
console.log("\nAll chunks embedded. Vector retrieval is ready - set RETRIEVAL_MODE=vector to use it.");
