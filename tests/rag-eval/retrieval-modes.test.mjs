// Tests the retrieval mode switching, fallback, and fusion logic with stubbed I/O.
// No network, no database - these are the behaviours that decide whether the chat endpoint
// abstains or fabricates, so they should not depend on a live corpus to verify.
//
// Run: node --test tests/rag-eval/retrieval-modes.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { retrieveKnowledge, formatKnowledge, DEFAULT_MIN_SIMILARITY } from "../../app/api/ai-chat/knowledge-retrieval.mjs";

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

test("similarity floor default is conservative but non-zero", () => {
  assert.ok(DEFAULT_MIN_SIMILARITY > 0 && DEFAULT_MIN_SIMILARITY < 1);
});
