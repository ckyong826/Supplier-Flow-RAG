import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI chat session repair matches the session ownership contract", async () => {
  const [migration, route] = await Promise.all([
    readFile(new URL("../supabase/manual/repair-ai-chat.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai-chat/session/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /add column if not exists owner_token text/);
  assert.match(migration, /alter column owner_token set not null/);
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.match(route, /chatIdentity\(request\)/);
});
