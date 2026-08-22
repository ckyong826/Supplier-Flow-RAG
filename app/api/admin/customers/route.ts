import { audit, errorResponse, HttpError, requirePermission, supabase, supabaseJson } from "../../_supabase";

type CustomerPayload = {
  id?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  status?: "active" | "on_hold";
  assignedSalesId?: string | null;
  notes?: string;
};

function row(payload: CustomerPayload) {
  const companyName = payload.companyName?.trim();
  const contactName = payload.contactName?.trim();
  const email = payload.email?.trim().toLowerCase();
  if (!companyName || !contactName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("Company, contact name, and a valid email are required.", 400);
  if (payload.status && !["active", "on_hold"].includes(payload.status)) throw new HttpError("Invalid customer status.", 400);
  return {
    company_name: companyName,
    primary_contact_name: contactName,
    primary_email: email,
    phone: payload.phone?.trim() || null,
    status: payload.status || "active",
    assigned_sales_id: payload.assignedSalesId || null,
    notes: payload.notes?.trim() || null,
  };
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, "customer.read");
    const accounts = await supabaseJson<unknown>("customer_accounts?select=id,company_name,primary_contact_name,primary_email,phone,status,assigned_sales_id,notes,created_at,updated_at,rfqs(count),customer_price_overrides(count)&order=updated_at.desc");
    return Response.json({ accounts });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const staff = await requirePermission(request, "customer.manage");
    const account = row(await request.json() as CustomerPayload);
    const response = await supabase("customer_accounts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(account) });
    const created = (await response.json())[0];
    await audit(staff, { action: "customer.created", entityType: "customer_account", entityId: created?.id, metadata: { companyName: account.company_name } });
    return Response.json({ account: created }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const staff = await requirePermission(request, "customer.manage");
    const payload = await request.json() as CustomerPayload;
    if (!payload.id) throw new HttpError("Customer account id is required.", 400);
    const account = row(payload);
    await supabase(`customer_accounts?id=eq.${encodeURIComponent(payload.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...account, updated_at: new Date().toISOString() }) });
    await audit(staff, { action: "customer.updated", entityType: "customer_account", entityId: payload.id, metadata: { companyName: account.company_name } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
