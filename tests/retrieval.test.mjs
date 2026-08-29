import assert from "node:assert/strict";
import test from "node:test";
import { decomposeQuery, fuseByKeywords, fuseByKeywordsWithCoverage } from "../app/api/ai-chat/retrieval.mjs";

test("decomposes explicit multi-item buyer requests", () => {
  assert.deepEqual(
    decomposeQuery("Need 100 32A outdoor sockets; also 50 C20 MCBs"),
    ["Need 100 32A outdoor sockets; also 50 C20 MCBs", "Need 100 32A outdoor sockets", "50 C20 MCBs"],
  );
});

test("fuses product matches from every request clause", () => {
  const products = [
    { id: "socket", text: "32A outdoor industrial socket IP67" },
    { id: "mcb", text: "C20 miniature circuit breaker MCB" },
    { id: "cable", text: "PVC electrical cable" },
  ];
  assert.deepEqual(
    fuseByKeywords(products, decomposeQuery("Need 100 32A outdoor sockets; also 50 C20 MCBs"), (product) => product.text).map((product) => product.id),
    ["socket", "mcb"],
  );
});

test("does not let a requested quantity outrank an exact SKU", () => {
  const products = [
    { id: "cable", text: "2.5mm twin and earth cable 100m coil" },
    { id: "socket", text: "32A outdoor industrial socket PKF32M435" },
  ];
  assert.equal(
    fuseByKeywords(products, decomposeQuery("Add 100 PKF32M435 to my RFQ"), (product) => product.text)[0].id,
    "socket",
  );
});

test("decomposes product, payment, and delivery intents", () => {
  const question = "I'm a new customer in Kuala Lumpur and I need a 1-pole 40 A B-curve MCB. What product fits, and what payment and delivery terms apply?";
  assert.deepEqual(decomposeQuery(question), [
    question,
    "I'm a new customer in Kuala Lumpur and I need a 1-pole 40 A B-curve MCB.",
    "payment terms",
    "Kuala Lumpur delivery lead time",
  ]);
});

test("coverage retrieval keeps one chunk for every decomposed intent", () => {
  const chunks = [
    { id: "payment", text: "payment terms require deposit before delivery" },
    { id: "sales", text: "sales quotation requires SST confirmation" },
    { id: "product", text: "1-pole 40 A B-curve MCB product" },
    { id: "delivery", text: "Kuala Lumpur delivery takes 1-2 working days" },
  ];
  const question = "I'm a new customer in Kuala Lumpur and I need a 1-pole 40 A B-curve MCB. What product fits, and what payment and delivery terms apply?";
  const results = fuseByKeywordsWithCoverage(chunks, decomposeQuery(question), (chunk) => chunk.text, 5);
  const ids = new Set(results.map((chunk) => chunk.id));
  assert.ok(ids.has("product"));
  assert.ok(ids.has("payment"));
  assert.ok(ids.has("delivery"));
  assert.equal(ids.size, results.length);
});

test("decomposes sales SOP questions into a sales policy query", () => {
  const followUp = decomposeQuery("How soon should the sales team follow up on a sent quotation?");
  const unavailable = decomposeQuery("The brand my customer asked for is out of stock. What does the SOP say I should do?");
  assert.ok(followUp.includes("sales quotation SOP follow up 3 working days"));
  assert.ok(unavailable.includes("sales quotation SOP unavailable equivalent alternative"));
});

test("sales coverage keeps the sales SOP chunk", () => {
  const chunks = [
    { id: "delivery", text: "delivery dates are estimates until stock allocation" },
    { id: "sales", text: "follow up a sent quotation within 3 working days" },
  ];
  const question = "How soon should the sales team follow up on a sent quotation?";
  const results = fuseByKeywordsWithCoverage(chunks, decomposeQuery(question), (chunk) => chunk.text, 2);
  assert.equal(results[0].id, "sales");
});
