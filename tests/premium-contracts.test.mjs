import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const workflows = [
  ["customer CRM", "supabase/migrations/0009_customer_accounts.sql", /create table if not exists public\.customer_accounts/, "app/api/admin/customers/route.ts", /requirePermission\(request, "customer\.manage"\)/],
  ["customer pricing", "supabase/migrations/0009_customer_accounts.sql", /customer_price_overrides_account_product_idx/, "app/api/admin/prices/route.ts", /requireAdmin\(request\)/],
  ["RFQ ownership and follow-up", "supabase/migrations/0008_rfq_follow_up.sql", /follow_up_date/, "app/api/admin/rfqs/route.ts", /assignedTo|followUpDate/],
  ["CRM tasks", "supabase/migrations/0011_crm_tasks.sql", /create table if not exists public\.crm_tasks/, "app/api/admin/tasks/route.ts", /crm_tasks/],
  ["stock control", "supabase/migrations/0012_inventory_ledger.sql", /inventory_(movements|reservations)/, "app/api/admin/inventory/route.ts", /Inventory cannot go below zero|Not enough available stock/],
  ["quotation governance", "supabase/migrations/0013_quote_governance.sql", /approval_status/, "app/api/admin/quotations/route.ts", /Admin approval is required before sending/],
  ["webhook retry monitor", "supabase/migrations/0014_integration_deliveries.sql", /integration_deliveries/, "app/api/admin/integrations/route.ts", /AbortSignal\.timeout\(5000\)/],
  ["human-approved AI actions", "supabase/migrations/0015_ai_action_queue.sql", /ai_action_runs/, "app/api/admin/ai-actions/route.ts", /Created from approved AI action/],
  ["roles and audit trail", "supabase/migrations/0010_permissions_audit.sql", /audit_logs/, "app/api/admin/team/route.ts", /team\.role_changed/],
  ["knowledge base", "supabase/migrations/0004_public_knowledge_sources.sql", /is_public/, "app/api/admin/knowledge/route.ts", /requireAdmin\(request\)/],
];

for (const [name, migrationPath, migrationExpectation, routePath, routeExpectation] of workflows) {
  test(`${name} has schema and protected route coverage`, async () => {
    const [migration, route] = await Promise.all([source(migrationPath), source(routePath)]);
    assert.match(migration, migrationExpectation);
    assert.match(route, routeExpectation);
  });
}
