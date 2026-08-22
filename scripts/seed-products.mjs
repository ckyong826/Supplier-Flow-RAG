// Seeds the products table from the knowledge base, keeping catalogue and RAG in sync.
//
// Why this exists: the chat endpoint answers from two independent sources —
//   CATALOGUE FACTS   -> products table      (what can be quoted / added to an RFQ)
//   SUPPORT KNOWLEDGE -> knowledge_chunks    (what can be described)
// If they drift, the bot will happily describe a product it cannot quote, or quote one it
// knows nothing about. This seeder makes the knowledge base the source of truth for
// specifications and reconciles the two before writing anything.
//
// Run AFTER import-knowledge.mjs so both sides come from the same markdown.
//
// Usage:
//   node scripts/seed-products.mjs --dry-run     # reconcile and report, write nothing
//   node scripts/seed-products.mjs               # upsert by SKU
//   node scripts/seed-products.mjs --include-ranges   # also activate the range entries
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

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
const dryRun = args.includes("--dry-run");
const includeRanges = args.includes("--include-ranges");

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

// These knowledge cards describe a product RANGE, not an orderable part number. The catalogue
// gives them invented codes so they have somewhere to live, but a customer cannot order
// "S200-M-UC" — they have to pick a current rating. Left inactive by default so the bot can
// still describe them from the knowledge base but cannot add them to an RFQ cart.
const RANGE_SKUS = new Set(["S200-M-UC", "XPOLE-HL-MCB", "ACTI9-IPRD"]);

// Knowledge cards whose heading carries no SKU, mapped to the catalogue code by hand.
const HEADING_ALIASES = {
  "ABB S200 M UC range": "S200-M-UC",
  "Eaton xPole Home HL MCB technical data": "XPOLE-HL-MCB",
  "Schneider Electric Acti9 iPRD range": "ACTI9-IPRD"
};

// ---------------------------------------------------------------- parse the knowledge base

function parseKnowledgeCards(markdown) {
  const cards = [];
  // Split on "## <n>. <heading>" and keep the body with each heading.
  const sections = markdown.split(/^## \d+\.\s*/m).slice(1);
  for (const section of sections) {
    const [headingLine, ...bodyLines] = section.split("\n");
    const heading = headingLine.trim();
    const body = bodyLines.join("\n");

    // "Acti9 iC60N MCB — A9F73140" -> SKU is the tail after the em dash.
    const parts = heading.split(/\s+[—–-]\s+/);
    const tail = parts.length > 1 ? parts[parts.length - 1].trim() : "";
    const sku = /^[A-Z0-9][A-Z0-9./-]{4,}$/i.test(tail) ? tail : HEADING_ALIASES[heading] || null;

    const bullets = [...body.matchAll(/^-\s+(.+)$/gm)].map((match) => match[1].trim());
    const category = body.match(/^Category:\s*(.+)$/m)?.[1]?.trim() || "";
    const source = body.match(/^Source:\s*(\S+)/m)?.[1]?.trim() || null;

    cards.push({ heading, sku, category, bullets, source });
  }
  return cards;
}

// Turn prose bullets into short spec chips. Long sentences make poor catalogue specs and
// pollute the keyword index, so anything sentence-length is left out of `specifications`
// (it still reaches the model through SUPPORT KNOWLEDGE).
function specsFromBullets(bullets) {
  const specs = [];
  for (const bullet of bullets) {
    const text = bullet.replace(/\.$/, "");
    if (text.length > 130) continue;
    // Split on ";" and ", and " as well, otherwise compound bullets like
    // "Breaking capacity: 6 kA ... 60898-1, and 10 kA ... 60947-2" exceed the chip limit and
    // get dropped whole - losing a spec a customer actually asks about.
    for (const piece of text.split(/;\s+|,\s+and\s+/)) {
      const chip = piece.trim();
      if (chip && chip.length <= 95 && !specs.includes(chip)) specs.push(chip);
    }
  }
  return specs.slice(0, 10);
}

// ---------------------------------------------------------------- parse the catalogue seed

function parseCatalogue(source) {
  const rows = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith('["')) continue;
    const strings = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
    // ["name", "sku", "category", "summary", ...specs..., "image_type", "image_url", "datasheet_path"]
    rows.push({
      name: strings[0],
      sku: strings[1],
      category: strings[2],
      summary: strings[3],
      image_type: strings[strings.length - 3],
      image_url: strings[strings.length - 2],
      datasheet_path: strings[strings.length - 1]
    });
  }
  return rows;
}

const knowledge = parseKnowledgeCards(readFileSync(join(root, "data", "supplierflow-official-knowledge.md"), "utf8"));
const catalogue = parseCatalogue(readFileSync(join(root, "app", "lib", "officialCatalogue.ts"), "utf8"));

const knowledgeBySku = new Map(knowledge.filter((card) => card.sku).map((card) => [card.sku.toUpperCase(), card]));

// ---------------------------------------------------------------- reconcile before writing

const problems = [];
const unmatchedCards = knowledge.filter((card) => !card.sku);
for (const card of unmatchedCards) problems.push(`knowledge card has no resolvable SKU: "${card.heading}"`);

const catalogueOnly = catalogue.filter((row) => !knowledgeBySku.has(row.sku.toUpperCase()));
const knowledgeOnly = [...knowledgeBySku.keys()].filter((sku) => !catalogue.some((row) => row.sku.toUpperCase() === sku));

const line = "-".repeat(92);
console.log(line);
console.log("Reconcile: knowledge base vs catalogue");
console.log(line);
console.log(`knowledge cards: ${knowledge.length}   catalogue products: ${catalogue.length}\n`);

if (catalogueOnly.length) {
  console.log("Catalogue products with NO knowledge card (bot can quote it but knows nothing about it):");
  for (const row of catalogueOnly) console.log(`  ${row.sku.padEnd(20)} ${row.name}`);
  console.log("");
}
if (knowledgeOnly.length) {
  console.log("Knowledge cards with NO catalogue product (bot can describe it but cannot quote it):");
  for (const sku of knowledgeOnly) console.log(`  ${sku}`);
  console.log("");
}
if (problems.length) {
  for (const problem of problems) console.log(`  ! ${problem}`);
  console.log("");
}

// ---------------------------------------------------------------- build the product records

const products = catalogue.map((row) => {
  const card = knowledgeBySku.get(row.sku.toUpperCase());
  const isRange = RANGE_SKUS.has(row.sku);
  // Knowledge base wins on specifications - it is the reviewed, cited source. Catalogue keeps
  // ownership of presentation fields (name, category, summary, imagery).
  const specifications = card ? specsFromBullets(card.bullets) : [];
  return {
    id: `official-${row.sku.toLowerCase()}`,
    name: row.name,
    sku: row.sku,
    category: row.category,
    summary: isRange
      ? `${row.summary} This is a product range — confirm the exact rating with our sales team before ordering.`
      : row.summary,
    specifications,
    availability: "Check availability",
    image_url: row.image_url || null,
    image_type: row.image_type,
    datasheet_path: card?.source || row.datasheet_path,
    price: 0,
    is_active: isRange ? includeRanges : true,
    hasKnowledge: Boolean(card),
    isRange
  };
});

console.log(line);
console.log(`${"SKU".padEnd(20)} ${"specs".padEnd(6)} ${"KB".padEnd(4)} ${"active".padEnd(7)} name`);
console.log(line);
for (const product of products) {
  console.log(
    `${product.sku.padEnd(20)} ${String(product.specifications.length).padEnd(6)} ` +
    `${(product.hasKnowledge ? "yes" : "NO").padEnd(4)} ${(product.is_active ? "yes" : "range").padEnd(7)} ${product.name}`
  );
}

// --show-specs prints exactly what will be written to `specifications`, which is what the
// keyword retriever indexes and what the model sees under CATALOGUE FACTS. Worth eyeballing
// after any edit to the knowledge base.
if (args.includes("--show-specs")) {
  console.log(line);
  console.log("Specifications derived from the knowledge base");
  console.log(line);
  for (const product of products) {
    const card = knowledgeBySku.get(product.sku.toUpperCase());
    console.log(`\n${product.sku} — ${product.name}`);
    for (const spec of product.specifications) console.log(`   • ${spec}`);
    const omitted = (card?.bullets || []).filter((bullet) => bullet.replace(/\.$/, "").length > 130);
    for (const bullet of omitted) console.log(`   ~ (prose, kept in RAG only) ${bullet.slice(0, 76)}…`);
  }
  console.log("");
}

const inactive = products.filter((product) => !product.is_active);
console.log(line);
console.log(`${products.length} product(s); ${products.filter((p) => p.hasKnowledge).length} backed by a knowledge card.`);
if (inactive.length) {
  console.log(`${inactive.length} range entr(y/ies) left INACTIVE so they cannot be added to an RFQ cart:`);
  for (const product of inactive) console.log(`  ${product.sku}  (${product.name})`);
  console.log("Pass --include-ranges to activate them anyway.");
}

if (dryRun) {
  console.log("\nDry run - nothing written.");
  process.exit(problems.length || catalogueOnly.length || knowledgeOnly.length ? 1 : 0);
}

// ---------------------------------------------------------------- write

const existing = await (await supabase("products?select=id,sku")).json();
const idBySku = new Map(existing.map((product) => [product.sku, product.id]));

let inserted = 0;
let updated = 0;
for (const product of products) {
  const { hasKnowledge, isRange, ...row } = product;
  void hasKnowledge; void isRange;
  const existingId = idBySku.get(product.sku);
  if (existingId) {
    await supabase(`products?id=eq.${encodeURIComponent(existingId)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...row, id: existingId, updated_at: new Date().toISOString() })
    });
    updated += 1;
  } else {
    await supabase("products", { method: "POST", body: JSON.stringify(row) });
    inserted += 1;
  }
}

// Anything in the table that this seeder does not own is deactivated rather than deleted, so
// stale demo rows stop competing in retrieval but nothing is lost.
const ownedSkus = new Set(products.map((product) => product.sku));
const orphans = existing.filter((product) => !ownedSkus.has(product.sku));
for (const orphan of orphans) {
  await supabase(`products?id=eq.${encodeURIComponent(orphan.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
  });
}

console.log(`\nInserted ${inserted}, updated ${updated}, deactivated ${orphans.length} unmanaged row(s).`);
if (orphans.length) for (const orphan of orphans) console.log(`  deactivated: ${orphan.sku}`);
console.log("\nNext: node tests/rag-eval/run-live-eval.mjs");
