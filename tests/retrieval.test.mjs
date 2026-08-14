import assert from "node:assert/strict";
import test from "node:test";
import { decomposeQuery, fuseByKeywords } from "../app/api/ai-chat/retrieval.mjs";

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
