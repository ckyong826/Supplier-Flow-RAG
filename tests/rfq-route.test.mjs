import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("RFQ submission delegates to the validated RFQ service", async () => {
  const route = await readFile(new URL("../app/api/rfqs/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ createRfq \} from "\.\.\/_rfq"/);
  assert.match(route, /return Response\.json\(await createRfq\(await request\.json\(\)\), \{ status: 201 \}\)/);
  assert.doesNotMatch(route, /async function supabase\(/);
});
