# Tecky Asia × SupplierFlow — Conversation Context Pack

Last updated: 2026-08-21  
Workspace: `D:\Freelances\supplierflow`  
Purpose: hand this file to the next conversation before making more changes.

## 1. Company and service context

| Item | Context |
|---|---|
| Company | Tecky Asia |
| Main positioning | Build practical websites, business systems, AI automation and internal AI knowledge tools for SMEs and suppliers. |
| Flagship demo | SupplierFlow: a B2B supplier catalogue, RFQ, quotation and operations portal for electrical/product suppliers. |
| Target buyer | Supplier, wholesaler, electrical distributor, contractor-facing SME or project procurement team. |
| Sales principle | Start with the business problem, show one relevant tier, then offer a scoped custom quote. |
| Recommended tier | Growth: enough workflow value to be profitable without the scope becoming enterprise custom work. |

### Tecky Asia service packages

These are commercial planning ranges, not hard-coded application prices.

| Service category | Starter | Growth / Recommended | Premium |
|---|---:|---:|---:|
| Website Development | RM888 founding / RM1,588 normal | RM1,888 founding / RM2,888–3,888 normal | RM3,888–6,500+ |
| Product & Business Systems | RM3,888–5,888 | RM9,888–18,000 | RM20,000–40,000+ |
| AI Automation | RM2,500–4,500 | RM6,000–12,000 | RM15,000–35,000+ |
| AI Knowledge / RAG | RM5,000–7,000 | RM8,000–15,000 | RM15,000–30,000+ |

### Sales flow

```text
Choose category → show Starter / Growth / Premium → recommend Growth → discovery call
→ demonstrate the matching SupplierFlow tier → confirm integrations/data/scope → custom quote
```

## 2. SupplierFlow product definition

SupplierFlow is a working B2B supplier workflow demo, not a normal consumer ecommerce store.

| Concept | Meaning |
|---|---|
| Catalogue | Public-facing list of active products. Only `is_active = true` products are public. |
| RFQ | Customer request. It contains customer details, requested products and quantities; it does not promise price or stock. |
| Quotation | Supplier response to an RFQ with unit prices, discount, SST, delivery, validity and payment terms. |
| Premium operations | Customer accounts, pricing rules, CRM tasks, inventory, integrations, audit logs, RAG knowledge and human-approved AI actions. |
| Official products | Real electrical product records in `app/lib/officialCatalogue.ts`; current source contains 26 products. |
| Demo data | Showcase records used for visual demonstrations. They may remain in the database as hidden rows after restoring official products. |

## 3. SupplierFlow tier mapping

### Public customer experience

| Tier | Customer can see/use |
|---|---|
| Starter | Catalogue, product search/category filtering, active product cards, RFQ cart, quantity editing, buyer details, project note, RFQ submission, RFQ confirmation email, RFQ status tracking by reference + email. |
| Growth | Everything in Starter plus the supplier-side quotation workflow that turns RFQs into priced quotations. |
| Premium | Everything in Growth plus Ask SupplyAI: product matching, natural-language RFQ assistant, customer-detail extraction, cart actions, tracking prompt and knowledge-backed answers. |

### Admin portal

| Tier | Admin sections |
|---|---|
| Starter | Overview, RFQ inbox, Products, Company settings. Starter avoids calling Premium-only APIs when those migrations are absent. |
| Growth | Starter plus Quotations: line items, revisions, unit prices, discount, tax/SST, delivery fee, validity, payment terms, notes and send workflow. |
| Premium | Growth plus Customer accounts, customer-specific prices, CRM Tasks & follow-up, Inventory, Knowledge base/RAG, Integrations/webhook history, AI action queue, Audit trail and staff/team controls. |

### URL demo gating

```text
http://localhost:3000/?tier=starter
http://localhost:3000/?tier=growth
http://localhost:3000/?tier=premium
```

| Public view | Minimum tier |
|---|---|
| Catalogue | Starter |
| My RFQ | Starter |
| Track RFQ | Starter |
| Ask SupplyAI | Premium |

| Admin section | Minimum tier |
|---|---|
| Overview / RFQ inbox / Products / Settings | Starter |
| Quotations | Growth |
| Customers / Tasks / Inventory / Knowledge / Integrations / AI actions / Audit | Premium |

The tier is parsed in `app/lib/demoTier.ts` and read on the client through `app/lib/useDemoTier.ts`. The delayed client read exists to avoid SSR hydration mismatch from reading `window.location` during the initial render. Do not reintroduce a `typeof window` branch in the render path or conditional hooks.

## 4. Feature details

### Catalogue and product management

| Area | Current behavior |
|---|---|
| Public query | `GET /api/catalog`; server reads active products only and supports limit/offset. |
| Product identity | SKU is the stable business identifier. Product database `id` remains the RFQ foreign-key identifier. |
| Product fields | Name, SKU, category, summary, specifications, availability, price, stock quantity, image URL/type, datasheet path and active flag. |
| Admin CRUD | Add/edit/hide/activate products, spreadsheet import, image/datasheet fields and product filtering by All/Active/Hidden. |
| Official restore | Admin action is labelled `Restore official catalogue`. It upserts official products by SKU, restores them as active, then hides stale active demo rows only after successful official writes. It does not delete old rows. |
| Official data | `app/lib/officialCatalogue.ts` currently has 26 real products and linked image/datasheet sources. |
| CLI reconciliation | `node scripts/seed-products.mjs --include-ranges` reconciles official catalogue and knowledge cards, then deactivates unmanaged rows. Without `--include-ranges`, range products can remain inactive by design. |
| Showcase seed | `POST /api/admin/showcase-seed` creates showcase products/RFQs/quotations/knowledge documents. It is demo data, not the official catalogue. |

### RFQ workflow

```text
Active catalogue → Add product → Set quantity → Enter name/company/email/note
→ POST /api/rfqs → rfqs + rfq_items → confirmation email → quote desk review
```

| Step | Behavior |
|---|---|
| Validation | Name, company, valid email, at least one active product and positive quantity are required. Quantity maximum is 100,000 per requested line. |
| Product check | `activeProductsById()` rechecks selected products server-side. Hidden/inactive products cannot be submitted. |
| Persistence | Creates `rfqs` and `rfq_items`; optional CRM account creation is tolerated when Premium CRM migration is absent. |
| Customer email | Resend confirmation now includes full HTML and plain text: customer details, RFQ reference, timestamp, requested items, SKU, quantity, listed availability, project requirements, next steps and tracking instructions. |
| Webhook | Optional `supplier_settings.rfq_webhook_url`; delivery history uses `integration_deliveries` when the Premium schema exists. |
| Tracking | `GET /api/rfqs/status?reference=...&email=...`; exact RFQ reference and the same email used at submission are required. |

### Quotation workflow

| Capability | Current behavior |
|---|---|
| Create | Add quotation line items to an RFQ. |
| Commercial fields | Unit price, discount %, SST/tax %, delivery fee, validity days, payment terms and notes. |
| Revision | Revision must increase for the same RFQ. |
| Approval | Premium governance supports pending/approved/rejected; admin approval is required before sending. |
| Send | Sends a full HTML + plain text quotation email through Resend when configured. |
| Customer response | `POST /api/quotations/respond`; customer can accept or reject a sent quotation using reference + email. |
| Status transitions | Quoted → accepted/won or rejected/lost; activity log records the action. |

### SupplyAI and chat

| Capability | Current behavior |
|---|---|
| Product matching | Keyword/retrieval matching against active catalogue products. |
| Natural RFQ | Parses product requests, quantities, customer name/company/email and notes from conversation. |
| Cart actions | Adds unambiguous products only when an explicit quantity is present. |
| Tracking intent | Detects status/track/follow-up language and opens the tracking form; it does not claim a status without reference + email verification. |
| Chat history | Cookie-owned chat sessions use `chat_sessions.owner_token` and `chat_messages`; session ownership prevents cross-user history access. |
| LLM | DeepSeek is optional. Without `DEEPSEEK_API_KEY`, deterministic fallback responses still cover product/RFQ/tracking actions. |
| Retrieval | Keyword mode works without OpenAI. Vector/hybrid retrieval needs `OPENAI_API_KEY`, embeddings and the vector migration. |
| Knowledge answers | The assistant is instructed to use only supplied catalogue/knowledge facts and abstain from unsupported price, stock, delivery or technical claims. |

### Premium operational modules

| Module | Purpose |
|---|---|
| Customer accounts | Company/contact records, active/on-hold status, notes, sales assignment and RFQ linkage. |
| Customer pricing | Per-customer or account-specific product price overrides. |
| CRM tasks | Follow-up tasks linked to RFQs/accounts with assignee, due date, status and notes. |
| Inventory | Stock movements, adjustments, reservations, releases and fulfilment states. |
| Knowledge base | Policy/FAQ/SOP/datasheet documents, text/PDF input, chunks, public visibility and source metadata. |
| RAG | Optional embeddings and similarity retrieval with source citations. |
| Integrations | RFQ webhook delivery records, attempts, status, errors and retry timing. |
| AI action queue | AI can propose a follow-up task; human approval is required before execution. |
| Audit trail | Records protected administrative actions and metadata. |
| PDF | Admin quotation/PDF support exists in `app/api/admin/pdf.ts`. |

## 5. Technical architecture

| Layer | Implementation |
|---|---|
| Framework | React 19 + TypeScript + Vinext/Vite. |
| Main page | `app/page.tsx` contains the public catalogue/RFQ/tracking/AI shell and opens AdminPortal. |
| Admin UI | `app/AdminPortal.tsx` plus reusable pieces in `app/admin/portal/` and `app/admin/AdminPrimitives.tsx`. |
| Public chrome | `app/components/SiteChrome.tsx`. |
| Server API | Route handlers in `app/api/**/route.ts`. |
| Database | Supabase PostgreSQL accessed through PostgREST using server-side service role calls. |
| Auth | Supabase Auth for admin login; staff role comes from `public.profiles`. |
| Email | Resend using `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. |
| AI chat | Optional DeepSeek chat completion. |
| Embeddings | Optional OpenAI `text-embedding-3-small` flow for knowledge retrieval. |
| Spreadsheet import | Existing `xlsx` dependency. |
| Styling | `app/globals.css`; current UI is a distinctive SupplierFlow portal style with purple/indigo brand accents. |

### Important server helpers

| File | Responsibility |
|---|---|
| `app/api/_supabase.ts` | Configuration checks, service-role PostgREST wrapper, staff/admin/permission checks, error mapping and audit helper. |
| `app/api/_catalogue.ts` | Active product list, product lookup by ID, product text/facts formatting. |
| `app/api/_rfq.ts` | RFQ validation, account fallback, RFQ persistence, confirmation email, webhook, status lookup and quotation response. |
| `app/api/_rfq-email.mjs` | Pure RFQ confirmation HTML/plain-text rendering; independently testable. |
| `app/api/ai-chat/_session.ts` | Cookie identity, session ownership and session creation. |
| `app/lib/demoTier.ts` | Public/admin tier visibility rules. |
| `app/lib/officialCatalogue.ts` | Official real product source list. |

## 6. Database model and migrations

### Core tables

| Group | Tables |
|---|---|
| RFQ | `rfqs`, `rfq_items`, `activity_logs` |
| Catalogue | `products` |
| Quotations | `quotations`, `quotation_items` |
| Identity | `profiles`, `customer_accounts` |
| Operations | `crm_tasks`, `inventory_movements`, `inventory_reservations` |
| AI/knowledge | `knowledge_documents`, `knowledge_chunks`, `chat_sessions`, `chat_messages` |
| Governance | `audit_logs`, `integration_deliveries`, `ai_action_runs` |
| Supplier config | `supplier_settings` |

### Migration sequence

| Migration | Adds |
|---|---|
| 0002 | Vector retrieval similarity floor, coverage function and vector index. |
| 0003 | `chat_sessions.owner_token` and ownership index. Required for AI chat. |
| 0004 | Knowledge source metadata/public visibility and final retrieval function. |
| 0005 | RFQ assignment. |
| 0006 | Stock quantity and customer price overrides. |
| 0007 | RFQ webhook URL. |
| 0008 | RFQ follow-up date. |
| 0009 | Customer accounts, account links and account price index. |
| 0010 | Staff roles and audit logs. |
| 0011 | CRM tasks. |
| 0012 | Inventory movements/reservations. |
| 0013 | Quotation approval governance. |
| 0014 | Integration delivery history. |
| 0015 | Human-approved AI action queue. |
| 20260815 | Allows `products.availability = 'Check availability'`. Required by the official catalogue. |

### Manual SQL files

| File | Use |
|---|---|
| `supabase/manual/apply-0002-0008.sql` | Idempotent combined repair for migrations 0002–0008. |
| `supabase/manual/repair-ai-chat.sql` | Small repair when AI chat reports missing `chat_sessions.owner_token`. |
| `supabase/premium-schema-bundle.sql` | One-copy combined Premium schema bundle for 0009–0015 plus availability constraint. |
| `supabase/manual/restore-official-catalogue.sql` | Small availability-constraint repair when the Premium bundle was already run and official seed rejects `Check availability`. |

Do not assume the remote Supabase schema matches `supabase/schema.sql`. Previous sessions observed remote failures for missing `owner_token`, customer accounts, CRM/inventory/audit/integration/AI-action tables and quotation approval columns. Verify the remote schema before debugging UI code.

## 7. Required environment variables

Never copy secret values into a conversation or this file. Only names are recorded.

| Variable | Used for | Required? |
|---|---|---|
| `SUPABASE_URL` | Supabase REST/Auth/Storage endpoint | Yes |
| `SUPABASE_ANON_KEY` | Admin sign-in token exchange | Yes for admin login |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side PostgREST and storage calls | Yes for server features |
| `RESEND_API_KEY` | RFQ/quotation email delivery | Optional; email disabled when absent |
| `RESEND_FROM_EMAIL` | Sender address | Optional with Resend key |
| `DEEPSEEK_API_KEY` | Live SupplyAI chat response | Optional; fallback works without it |
| `OPENAI_API_KEY` | Embeddings/vector retrieval | Optional; keyword retrieval works without it |
| `RETRIEVAL_MODE` | `keyword`, `vector` or `hybrid` retrieval selection | Optional; defaults to keyword |
| `RETRIEVAL_TOP_K` | Retrieval result limit | Optional |

## 8. Run and verify

### Local commands

```powershell
cd D:\Freelances\supplierflow
npm run dev
npm run build
npm run lint
node --test
```

Expected recent local verification: build passed, lint had no errors, and 41 tests passed. Existing lint warnings are the current `<img>` optimization warnings; do not treat them as feature failures.

### API smoke checks

| Check | Expected |
|---|---|
| `GET http://localhost:3000/api/catalog?limit=20&offset=0` | Active catalogue products, not an empty list after official restore. |
| `POST /api/ai-chat` with a tracking question | A tracking prompt, not the generic database failure message. Requires `owner_token` migration. |
| `GET /api/rfqs/status?reference=...&email=...` | RFQ status or a clear “No matching RFQ” when the pair is wrong. |
| `POST /api/rfqs` | Creates RFQ and RFQ items; sends email only when Resend env is configured. |
| `POST /api/quotations/respond` | Accepts/rejects only a matching sent quotation and email. |

### User journey verification

| Tier | Verify |
|---|---|
| Starter | Catalogue loads active products → add to RFQ → enter buyer details → submit → receive reference → Track RFQ with same email. |
| Growth | Admin login → RFQ inbox → create quotation → set prices/tax/delivery/validity → send → verify quotation email → customer accepts/rejects. |
| Premium | Customer account → customer price override → CRM task → inventory adjustment/reservation → knowledge document upload → AI action approval → audit/integration record. |
| AI | Ask for a product → verify grounded match; ask to add quantity → verify cart; ask to track RFQ → verify tracking form; test missing data → verify no invented answer. |

## 9. Known issues and handoff priorities

| Priority | Item | Next action |
|---|---|---|
| P0 | Remote schema may still be behind code. | Run the relevant manual SQL in Supabase SQL Editor, then reload PostgREST schema. |
| P0 | Official catalogue restore requires the availability constraint. | Run `restore-official-catalogue.sql`, then click `Restore official catalogue` or run the official seed with `--include-ranges`. |
| P0 | AI chat requires `chat_sessions.owner_token`. | Run `repair-ai-chat.sql` if the API reports `PGRST204 owner_token`. |
| P1 | Browser control was not available in the previous session. | Retry built-in in-app browser connection before claiming UI verification. |
| P1 | Real email delivery depends on Resend env vars. | Configure/test Resend separately; do not mistake missing email credentials for RFQ persistence failure. |
| P2 | `app/page.tsx` is still large. | Split only when a concrete maintenance problem appears; existing public flows are stable. |
| P2 | Official catalogue has 26 records while earlier conversation remembered 25. | Treat the current source file and SKU list as truth unless the business wants a curated 25-product subset. |

## 10. Non-negotiable product rules

| Rule | Reason |
|---|---|
| Never expose inactive products publicly. | Hidden products may be stale/demo/unsupported. |
| Never claim final stock, price, lead time or delivery from an RFQ. | RFQ is a request; quotation is the commercial response. |
| Preserve product rows; hide instead of delete for demo cleanup. | Existing RFQs may reference old products. |
| Use SKU for official catalogue reconciliation. | Names/images can change; SKU is the business key. |
| Keep optional Premium calls gated by tier. | Starter must remain usable before Premium migrations are applied. |
| Do not read or print `.env` secrets. | Credentials must stay server-side. |
| Preserve existing uncommitted work. | The repository currently contains a broad in-progress feature set; do not reset or discard it. |

## 11. Copy-paste starter prompt for the next conversation

```text
Continue the Tecky Asia SupplierFlow project in D:\Freelances\supplierflow.

SupplierFlow is a B2B supplier catalogue/RFQ/quotation/operations demo for electrical suppliers. Tecky Asia sells four service categories: Website Development, Product & Business Systems, AI Automation, and AI Knowledge/RAG. Growth is the recommended commercial tier.

Current app tiers:
- Starter: catalogue, RFQ cart/submission, RFQ tracking, basic admin overview/RFQ/products/settings.
- Growth: Starter + quotation creation, revisions, pricing, tax, delivery, validity, payment terms and send workflow.
- Premium: Growth + SupplyAI, customer accounts/pricing, CRM tasks, inventory, knowledge/RAG, integrations, AI action approval and audit.

Tier URLs: /?tier=starter, /?tier=growth, /?tier=premium.
Official catalogue source: app/lib/officialCatalogue.ts; current source has 26 real products.
Important remote schema checks: 0002–0015 plus 20260815_check_availability.sql may not have been applied. Manual repair files are in supabase/manual/ and supabase/premium-schema-bundle.sql.

Before changing code:
1. Read this context file.
2. Check remote schema/API state, not only local schema.sql.
3. Preserve existing uncommitted changes and do not read/print .env values.
4. Use tables for feature/status summaries and keep the implementation minimal.
5. Run build, lint and node --test after changes.
```
