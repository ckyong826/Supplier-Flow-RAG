import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("RFQ submission reuses the default-safe Supabase helper", async () => {
  const route = await readFile(new URL("../app/api/rfqs/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ configurationError, supabase \} from "\.\.\/_supabase"/);
  assert.doesNotMatch(route, /async function supabase\(/);
});
