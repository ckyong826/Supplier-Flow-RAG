// Jev routing latency probe (Phase 6).
//
// Calls the hosted Jev API directly (no app server, no database) over the
// dev routing fixture at concurrencies 1, 2 and 5. Separates routing latency
// from retrieval/generation and breaks down fallback reasons (timeout, 429,
// 5xx, connection, auth, invalid, empty) without logging keys or responses.
//
//   node tests/rag-eval/run-routing-latency.mjs [--json out.json] [--delay 200]
//
// Needs TYPESAFE_API_KEY (.env/.env.local are loaded like the other runner).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJevRoute } from "../../app/api/ai-chat/decision-router/jev.mjs";
import { getDecisionConfig } from "../../app/api/ai-chat/decision-router/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

for (const file of [".env", ".env.local"]) {
  const path = join(here, "..", "..", file);
  if (!existsSync(path)) continue;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep < 1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const jsonOut = flag("--json", null);
const delayMs = Number(flag("--delay", 200)) || 0;
const concurrencies = (flag("--concurrency", "1,2,5") || "1,2,5").split(",").map(Number);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fixture = JSON.parse(readFileSync(join(here, "routing-fixture.json"), "utf8"));
const config = getDecisionConfig();
if (!config.apiKey && !process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set; probe needs the hosted API.");
  process.exit(2);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

async function probe(concurrency) {
  const results = new Array(fixture.cases.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= fixture.cases.length) return;
      const c = fixture.cases[i];
      const started = Date.now();
      const raw = await fetchJevRoute(
        { query: c.query, history: c.history || "", model: config.model },
        { config },
      );
      results[i] = {
        id: c.id,
        latencyMs: raw?.routingLatencyMs ?? Date.now() - started,
        error: raw?.error || null,
      };
      if (delayMs) await sleep(delayMs);
    }
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, fixture.cases.length) }, worker));
  return { results, wallMs: Date.now() - started };
}

const report = {};
for (const concurrency of concurrencies) {
  const { results, wallMs } = await probe(concurrency);
  const ok = results.filter((r) => !r.error);
  const latencies = ok.map((r) => r.latencyMs);
  const errors = {};
  for (const r of results.filter((r) => r.error)) errors[r.error] = (errors[r.error] || 0) + 1;
  report[concurrency] = {
    queries: results.length,
    ok: ok.length,
    errors,
    wallMs,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    mean: latencies.length ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : null,
  };
}

console.log(`Jev latency probe: ${fixture.cases.length} queries/model ${config.model}`);
console.log("| Concurrency | OK | p50 | p95 | Mean | Wall | Errors |");
console.log("|---|---:|---:|---:|---:|---:|---|");
for (const concurrency of concurrencies) {
  const r = report[concurrency];
  const fmt = (v) => (v == null ? "n/a" : `${Math.round(v)} ms`);
  const err = Object.entries(r.errors).map(([k, v]) => `${k}:${v}`).join(",") || "none";
  console.log(`| ${concurrency} | ${r.ok}/${r.queries} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.mean)} | ${(r.wallMs / 1000).toFixed(1)}s | ${err} |`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ ranAt: new Date().toISOString(), model: config.model, report }, null, 2) + "\n");
  console.log(`\nWrote ${jsonOut}`);
}
process.exit(0);
