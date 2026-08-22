// Walks the admin auth chain one step at a time and reports exactly where it breaks.
//
// The portal's "could not load" banner collapses several very different failures into one
// message: missing env vars, a dead access token, a user with no admin profile row, and a
// PostgREST schema mismatch all look identical from the browser. This script separates them.
//
// Run it from the project root, where .env lives. Nothing is written to the database.
//
// Usage:
//   node scripts/diagnose-admin.mjs                       # env + schema checks only
//   node scripts/diagnose-admin.mjs you@example.com pass  # also test the full sign-in chain
//
// Secrets are never printed - keys are shown only as a masked fingerprint.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const [email, password] = process.argv.slice(2);

let failures = 0;
const pass = (message) => console.log(`  PASS  ${message}`);
const fail = (message, hint) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
  if (hint) console.log(`        -> ${hint}`);
};
const info = (message) => console.log(`        ${message}`);
const section = (title) => console.log(`\n${title}`);

/** Shows enough of a key to compare two values without revealing either. */
function fingerprint(value) {
  if (!value) return "(missing)";
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

/** JWTs carry their role and expiry in the payload - decode without verifying. */
function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function readBody(response) {
  const text = await response.text().catch(() => "");
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text.slice(0, 300);
  }
}

// ---------------------------------------------------------------- 1. environment

section("1. Environment");

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of [["SUPABASE_URL", url], ["SUPABASE_ANON_KEY", anon], ["SUPABASE_SERVICE_ROLE_KEY", service]]) {
  if (value) pass(`${name} is set — ${name === "SUPABASE_URL" ? value : fingerprint(value)}`);
  else fail(`${name} is missing`, "Add it to .env, then restart the dev server.");
}

if (!url || !anon || !service) {
  console.log("\nCannot continue without all three variables.");
  process.exit(1);
}

// A service key pasted into the anon slot (or vice versa) fails in confusing ways.
const anonClaims = decodeJwt(anon);
const serviceClaims = decodeJwt(service);
if (anonClaims?.role && anonClaims.role !== "anon") {
  fail(`SUPABASE_ANON_KEY has role "${anonClaims.role}", expected "anon"`, "The anon and service-role keys are probably swapped.");
} else if (anonClaims?.role) pass('SUPABASE_ANON_KEY has role "anon"');

if (serviceClaims?.role && serviceClaims.role !== "service_role") {
  fail(`SUPABASE_SERVICE_ROLE_KEY has role "${serviceClaims.role}", expected "service_role"`, "The anon and service-role keys are probably swapped.");
} else if (serviceClaims?.role) pass('SUPABASE_SERVICE_ROLE_KEY has role "service_role"');

// Keys are project-scoped; one from another project authenticates but sees no tables.
const host = new URL(url).host.split(".")[0];
for (const [name, claims] of [["SUPABASE_ANON_KEY", anonClaims], ["SUPABASE_SERVICE_ROLE_KEY", serviceClaims]]) {
  if (claims?.ref && claims.ref !== host) {
    fail(`${name} belongs to project "${claims.ref}" but SUPABASE_URL points at "${host}"`, "Copy both keys from the same Supabase project.");
  }
}

// ---------------------------------------------------------------- 2. reachability

section("2. Reachability and schema (service-role key)");

async function restQuery(path) {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
}

try {
  const response = await restQuery("profiles?select=user_id&limit=1");
  if (response.ok) pass("PostgREST reachable and the service-role key is accepted");
  else fail(`PostgREST returned ${response.status}`, await readBody(response));
} catch (error) {
  fail("Could not reach Supabase", `${error.message} — check the URL, your network, and whether the project is paused.`);
  process.exit(1);
}

// These are exactly the queries the admin endpoints run. If one 400s here, that endpoint
// is what produces the banner.
const queries = [
  ["dashboard: rfqs + embeds", "rfqs?select=id,reference,status,rfq_items(id,sku,quantity),activity_logs(id,message)&limit=1"],
  ["dashboard: quotations + embeds", "quotations?select=id,reference,rfqs(reference),quotation_items(sku,quantity,unit_price)&limit=1"],
  ["products", "products?order=updated_at.desc&limit=1"],
  ["settings", "supplier_settings?select=*&limit=1"],
  ["knowledge + chunk count", "knowledge_documents?select=id,title,knowledge_chunks(count)&limit=1"],
];

for (const [label, query] of queries) {
  const response = await restQuery(query);
  if (response.ok) pass(label);
  else fail(`${label} returned ${response.status}`, await readBody(response));
}

// ---------------------------------------------------------------- 3. admin profiles

section("3. Admin accounts");

const adminsResponse = await restQuery("profiles?role=eq.admin&select=user_id,role");
if (!adminsResponse.ok) {
  fail(`Could not read profiles (${adminsResponse.status})`, await readBody(adminsResponse));
} else {
  const admins = await adminsResponse.json();
  if (Array.isArray(admins) && admins.length) {
    pass(`${admins.length} account(s) with role 'admin'`);
    for (const admin of admins) info(`user_id ${admin.user_id}`);
  } else {
    fail("No rows in public.profiles have role 'admin'", "Every admin request will return 403. Create an auth user, then run:\n           insert into public.profiles (user_id, role) values ('<AUTH_USER_UUID>', 'admin');");
  }
}

// ---------------------------------------------------------------- 4. sign-in chain

if (!email || !password) {
  section("4. Sign-in chain");
  info("Skipped — pass an email and password to test it:");
  info("node scripts/diagnose-admin.mjs you@example.com 'your-password'");
} else {
  section("4. Sign-in chain");

  const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!tokenResponse.ok) {
    fail(`Password grant returned ${tokenResponse.status}`, await readBody(tokenResponse));
    info("Common causes: wrong password, or the user's email is not confirmed in Authentication > Users.");
  } else {
    const session = await tokenResponse.json();
    pass("Password grant succeeded");

    const claims = decodeJwt(session.access_token);
    if (claims?.exp) {
      const minutes = Math.round((claims.exp * 1000 - Date.now()) / 60000);
      info(`Access token expires in ~${minutes} min (Supabase default is 60)`);
    }
    if (session.refresh_token) pass("A refresh token was issued");
    else fail("No refresh token in the response", "The portal cannot renew the session, so it dies at the one-hour mark.");

    // Step the server takes next: verify the token against /auth/v1/user.
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` },
    });
    if (!userResponse.ok) {
      fail(`Token verification returned ${userResponse.status}`, await readBody(userResponse));
    } else {
      const user = await userResponse.json();
      pass(`Token verified — user ${user.id}`);

      // Final gate: requireAdmin looks for an admin profile row for this user id.
      const profileResponse = await restQuery(`profiles?user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=user_id`);
      if (!profileResponse.ok) {
        fail(`Profile lookup returned ${profileResponse.status}`, await readBody(profileResponse));
      } else {
        const rows = await profileResponse.json();
        if (Array.isArray(rows) && rows.length) pass("This user has an admin profile row — the full chain works");
        else fail("This user has no admin profile row", `Run:\n           insert into public.profiles (user_id, role) values ('${user.id}', 'admin');`);
      }
    }
  }
}

// ---------------------------------------------------------------- summary

console.log(
  failures
    ? `\n${failures} check(s) failed. Fix the FAIL lines above, top to bottom.`
    : "\nAll checks passed. If the portal still shows the banner, sign out and sign in again:\n" +
      "a token stored before the refresh-token fix cannot be renewed, and Retry cannot repair it.",
);
process.exit(failures ? 1 : 0);
