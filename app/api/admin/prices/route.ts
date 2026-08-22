import { audit, errorResponse, HttpError, requireAdmin, requirePermission, supabase, supabaseJson } from "../../_supabase";

type PriceRule = { id: string; customer_email: string; account_id?: string | null; product_id: string; unit_price: number; products?: { name?: string; sku?: string } | null; customer_accounts?: { company_name?: string; primary_email?: string } | null };
type PricePayload = { id?: string; accountId?: string | null; customerEmail?: string; productId?: string; unitPrice?: number };

function normalized(payload: PricePayload) {
  const email = payload.customerEmail?.trim().toLowerCase();
  const price = Number(payload.unitPrice);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !payload.productId || !Number.isFinite(price) || price < 0) throw new HttpError("Customer email, product and a valid price are required.", 400);
  return { email, productId: payload.productId, price };
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, "price.manage");
    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
    const filter = email ? `&customer_email=eq.${encodeURIComponent(email)}` : "";
    const rules = await supabaseJson<PriceRule[]>(`customer_price_overrides?select=id,customer_email,account_id,product_id,unit_price,products(name,sku),customer_accounts(company_name,primary_email)&order=customer_email.asc,product_id.asc${filter}`);
    return Response.json({ rules });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const staff = await requireAdmin(request);
    const payload = await request.json() as PricePayload;
    const { email, productId, price } = normalized(payload);
    const [account] = await supabaseJson<Array<{ id: string }>>(`customer_accounts?primary_email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
    const accountId = payload.accountId || account?.id || null;
    const [accountRules, emailRules] = await Promise.all([
      accountId ? supabaseJson<Array<{ id: string }>>(`customer_price_overrides?account_id=eq.${encodeURIComponent(accountId)}&product_id=eq.${encodeURIComponent(productId)}&select=id`) : Promise.resolve([]),
      supabaseJson<Array<{ id: string }>>(`customer_price_overrides?customer_email=eq.${encodeURIComponent(email)}&product_id=eq.${encodeURIComponent(productId)}&select=id`),
    ]);
    const existing = accountRules[0] || emailRules[0];
    const response = existing
      ? await supabase(`customer_price_overrides?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ unit_price: price, account_id: accountId, updated_at: new Date().toISOString() }) })
      : await supabase("customer_price_overrides", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ customer_email: email, account_id: accountId, product_id: productId, unit_price: price }) });
    const rule = (await response.json())[0];
    await audit(staff, { action: existing ? "price_rule.updated" : "price_rule.created", entityType: "customer_price_override", entityId: rule?.id, metadata: { productId, accountId, price } });
    return Response.json({ rule });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const staff = await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Price rule id is required." }, { status: 400 });
    await supabase(`customer_price_overrides?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    await audit(staff, { action: "price_rule.deleted", entityType: "customer_price_override", entityId: id });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
