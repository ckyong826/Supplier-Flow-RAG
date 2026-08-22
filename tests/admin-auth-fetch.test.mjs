import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every admin portal request uses the token-refreshing client", async () => {
  const portal = await readFile(new URL("../app/AdminPortal.tsx", import.meta.url), "utf8");
  assert.match(portal, /useAdminApi\(token\)/);
  assert.doesNotMatch(portal, /\bfetch\(\s*["'`]\/api\/admin/);
});
