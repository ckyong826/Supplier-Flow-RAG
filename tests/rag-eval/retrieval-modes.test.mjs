// Tests the retrieval mode switching, fallback, and fusion logic with stubbed I/O.
// No network, no database - these are the behaviours that decide whether the chat endpoint
// abstains or fabricates, so they should not depend on a live corpus to verify.
//
// Run: node --test tests/rag-eval/retrieval-modes.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { retrieveKnowledge, formatKnowledge, DEFAULT_MIN_SIMILARITY } from "../../app/api/ai-chat/knowledge-retrieval.mjs";
import { decomposeQuery, documentSummary, fuseByKeywords, rerankByCoverage, rewriteQuery } from "../../app/api/ai-chat/retrieval.mjs";

const rows = [
  { content: "delivery takes 1-2 working days in klang valley", knowledge_documents: { title: "Delivery Policy", source_type: "policy" } },
  { content: "quotation validity is 14 calendar days", knowledge_documents: { title: "Payment Terms", source_type: "policy" } }
];
const fakeSupabase = async () => ({ json: async () => rows });
const zeroVector = () => new Array(1536).fill(0);

test("keyword mode never calls the embedder", async () => {
  let called = false;
  const result = await retrieveKnowledge({
    supabase: fakeSupabase, question: "delivery time", queries: ["delivery"],
    mode: "keyword", embed: async () => { called = true; return zeroVector(); }
  });
  assert.equal(called, false, "keyword mode must not incur embedding cost");
  assert.equal(result.mode, "keyword");
});

test("vector mode returning nothing does NOT fall back to keyword", async () => {
  // This is the single most important behaviour for the negative questions. Falling back here
  // would reintroduce the weak context that the similarity floor exists to suppress, turning
  // an abstention into a fabrication.
  const supabaseEmpty = async (path) => ({ json: async () => (path.startsWith("rpc/") ? [] : rows) });
  const result = await retrieveKnowledge({
    supabase: supabaseEmpty, question: "what is the SST rate", queries: ["sst rate"],
    mode: "vector", embed: async () => zeroVector()
  });
  assert.equal(result.mode, "vector");
  assert.equal(result.chunks.length, 0);
  assert.equal(formatKnowledge(result.chunks), "", "empty retrieval must produce empty context");
});

test("vector failure degrades to keyword and reports why", async () => {
  const result = await retrieveKnowledge({
    supabase: fakeSupabase, question: "delivery time", queries: ["delivery"],
    mode: "vector", embed: async () => { throw new Error("OPENAI_API_KEY is not set"); }
  });
  assert.equal(result.mode, "keyword", "a retrieval outage must not take the endpoint down");
  assert.equal(result.requestedMode, "vector");
  assert.match(result.degradedReason, /OPENAI_API_KEY/);
  assert.ok(result.chunks.length > 0);
});

test("hybrid fuses both rankings without duplicating a shared chunk", async () => {
  const shared = { content: rows[0].content, title: "Delivery Policy", source_type: "policy", similarity: 0.9 };
  const supabaseHybrid = async (path) => ({ json: async () => (path.startsWith("rpc/") ? [shared] : rows) });
  const result = await retrieveKnowledge({
    supabase: supabaseHybrid, question: "delivery time", queries: ["delivery"],
    mode: "hybrid", limit: 5, embed: async () => zeroVector()
  });
  assert.equal(result.mode, "hybrid");
  const contents = result.chunks.map((chunk) => chunk.content);
  assert.equal(new Set(contents).size, contents.length, "fusion must dedupe");
  assert.equal(contents[0], shared.content, "a chunk found by both retrievers should rank first");
});

test("hybrid abstains when the vector gate finds nothing", async () => {
  // Without this gate hybrid can never abstain: keyword overlap is never exactly zero, so
  // every unanswerable question would still arrive at the model wrapped in context.
  const supabaseGated = async (path) => ({ json: async () => (path.startsWith("rpc/") ? [] : rows) });
  const result = await retrieveKnowledge({
    supabase: supabaseGated, question: "what is the SST rate", queries: ["sst rate"],
    mode: "hybrid", embed: async () => zeroVector()
  });
  assert.equal(result.mode, "hybrid");
  assert.equal(result.gated, true);
  assert.equal(result.chunks.length, 0, "hybrid must not fall back to keyword when the gate is shut");
});

test("hybrid preserves one chunk for each decomposed subquery", async () => {
  const product = { content: "product A9F73140", title: "Catalogue", source_type: "datasheet", similarity: 0.9 };
  const payment = { content: "payment terms", title: "Payment Terms", source_type: "policy", similarity: 0.8 };
  const delivery = { content: "Klang Valley delivery 1-2 working days", title: "Delivery Policy", source_type: "policy", similarity: 0.7 };
  const supabaseHybrid = async (path) => ({ json: async () => (path.startsWith("rpc/") ? [product] : [product, payment, delivery]) });
  const result = await retrieveKnowledge({
    supabase: supabaseHybrid,
    question: "I need a product, payment and delivery terms",
    queries: ["full", "product", "payment terms", "delivery terms"],
    mode: "hybrid",
    limit: 3,
    embed: async () => zeroVector()
  });
  assert.deepEqual(
    result.chunks.map((chunk) => chunk.title).sort(),
    ["Catalogue", "Payment Terms", "Delivery Policy"].sort(),
  );
});

test("similarity floor default is conservative but non-zero", () => {
  assert.ok(DEFAULT_MIN_SIMILARITY > 0 && DEFAULT_MIN_SIMILARITY < 1);
});

test("exact SKU terms outrank generic catalogue wording", () => {
  const exact = { content: "LC1D09BD uses a 24 V DC coil", title: "Official" };
  const generic = { content: "TeSys contactors have coil voltage options", title: "Generic" };
  const ranked = fuseByKeywords([generic, exact], ["What coil voltage does LC1D09BD use?"], (item) => item.content);
  assert.equal(ranked[0], exact);
});

test("Kuala Lumpur delivery decomposition includes the policy's regional name", () => {
  assert.ok(decomposeQuery("What delivery time applies in Kuala Lumpur?").includes("Kuala Lumpur Klang Valley delivery 1–2 working days next working day"));
});

test("auxiliary-terminal questions decompose into the terminal identifiers", () => {
  assert.ok(decomposeQuery("Does 1NO + 1NC tell me the auxiliary terminal IDs?").some((query) => query.includes("13 14 21 22")));
});

test("policy questions decompose into exact published values", () => {
  const queries = decomposeQuery("How long is a quotation valid?");
  assert.ok(queries.includes("quotation validity 14 calendar days"));
});

test("history rewrite resolves a short follow-up to its prior SKU", () => {
  assert.equal(
    rewriteQuery("What coil voltage does it use?", "The customer wants TeSys Deca LC1D09BD."),
    "The customer wants TeSys Deca LC1D09BD. What coil voltage does it use?",
  );
  assert.equal(rewriteQuery("What is the payment policy?", "Earlier product question."), "What is the payment policy?");
});

test("second-stage reranker promotes exact identifiers", () => {
  const generic = { content: "TeSys contactors have several coil voltage options" };
  const exact = { content: "LC1D09BD uses a 24 V DC coil" };
  const ranked = rerankByCoverage(
    [generic, exact],
    ["What coil voltage does LC1D09BD use?"],
    (item) => item.content,
    2,
  );
  assert.equal(ranked[0], exact);
});

test("document summary preserves headings and technical fact lines", () => {
  const summary = documentSummary("# Product card\n\n- SKU: A9F73140\n- Rated current: 40 A\n- unrelated installation prose");
  assert.match(summary, /Product card/);
  assert.match(summary, /A9F73140/);
  assert.match(summary, /40 A/);
});

test("multi representation expands selected document summaries back to chunks", async () => {
  const documents = [{
    id: "doc-product",
    title: "Product Catalogue",
    source_type: "datasheet",
    content: "# Product catalogue\n\n- SKU: A9F73140\n- Rated current: 40 A\n- B curve"
  }];
  const chunks = [{
    document_id: "doc-product",
    chunk_index: 0,
    content: "A9F73140 is a 1-pole, 40 A B-curve MCB.",
    knowledge_documents: { title: "Product Catalogue", source_type: "datasheet" }
  }];
  const fakeSupabase = async (path) => ({ json: async () => path.startsWith("knowledge_documents?") ? documents : chunks });
  const result = await retrieveKnowledge({
    supabase: fakeSupabase,
    question: "What is A9F73140?",
    queries: ["What is A9F73140?"],
    mode: "multi",
    limit: 1,
  });
  assert.equal(result.mode, "multi");
  assert.equal(result.representation, "document-summary");
  assert.equal(result.chunks[0].content, chunks[0].content);
});
