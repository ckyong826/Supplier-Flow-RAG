import assert from "node:assert/strict";
import test from "node:test";
import { rateLimit } from "../app/api/_rateLimit.ts";

test("rate limit rejects requests after the bucket is full", () => {
  const request = new Request("http://localhost", { headers: { "cf-connecting-ip": "198.51.100.10" } });
  assert.equal(rateLimit(request, "test-chat-security", 1, 60_000), null);
  const limited = rateLimit(request, "test-chat-security", 1, 60_000);
  assert.equal(limited?.status, 429);
  assert.equal(limited?.headers.get("Retry-After"), "60");
});
