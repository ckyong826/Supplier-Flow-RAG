import { activeProductsById } from "./_catalogue";
import { HttpError, supabase, supabaseJson } from "./_supabase";

type RfqPayload = {
  customer?: { name?: string; company?: string; email?: string; note?: string };
  items?: Array<{ productId?: string; quantity?: number }>;
};

const visibleQuotationStatuses = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

function reference() {
  return `RFQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function validate(payload: RfqPayload) {
  const customer = payload.customer;
  const email = customer?.email?.trim();
  const items = (payload.items ?? []).filter((item) => item.productId && Number.isInteger(item.quantity) && item.quantity! > 0 && item.quantity! <= 100000);
  if (!customer?.name?.trim() || !customer.company?.trim() || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("Name, company and email are required.", 400);
  if (!items.length) throw new HttpError("Add at least one valid product to the RFQ.", 400);
  return { customer, email, items };
}

async function sendConfirmation(email: string, customerName: string, rfqReference: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: `We received your RFQ ${rfqReference}`, text: `Hi ${customerName},\n\nThanks for your request. Your reference is ${rfqReference}. Our quote desk will review it and reply shortly.\n\nSupplierFlow` }),
  });
  if (!response.ok) console.error("RFQ confirmation email failed", await response.text());
}

export async function createRfq(payload: RfqPayload) {
  const { customer, email, items: requestedItems } = validate(payload);
  const products = await activeProductsById(requestedItems.map((item) => item.productId!));
  const quantities = new Map<string, number>();
  for (const item of requestedItems) quantities.set(item.productId!, (quantities.get(item.productId!) || 0) + item.quantity!);
  const items = [...quantities].map(([productId, quantity]) => ({ product: products.get(productId), quantity }));
  if (items.some((item) => !item.product)) throw new HttpError("One or more RFQ products are unavailable. Refresh the catalogue and try again.", 400);

  const rfqReference = reference();
  const [rfq] = await supabaseJson<Array<{ id: string }>>("rfqs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ reference: rfqReference, customer_name: customer.name!.trim(), company_name: customer.company!.trim(), email: email.toLowerCase(), requirements: customer.note?.trim() || null }),
  });
  await supabase("rfq_items", { method: "POST", body: JSON.stringify(items.map(({ product, quantity }) => ({ rfq_id: rfq.id, product_id: product!.id, product_name: product!.name, sku: product!.sku, quantity }))) });
  await sendConfirmation(email, customer.name!.trim(), rfqReference);
  return { reference: rfqReference, rfqId: rfq.id };
}

export async function getRfqStatus(referenceValue: string | null, emailValue: string | null) {
  const referenceQuery = referenceValue?.trim();
  const email = emailValue?.trim().toLowerCase();
  if (!referenceQuery || !email) throw new HttpError("Reference and email are required.", 400);
  const [rfq] = await supabaseJson<Array<{ id: string; reference: string; status: string; created_at: string }>>(`rfqs?reference=eq.${encodeURIComponent(referenceQuery)}&email=eq.${encodeURIComponent(email)}&select=id,reference,status,created_at`);
  if (!rfq) throw new HttpError("No matching RFQ was found.", 404);
  const [quotation] = await supabaseJson<Array<unknown>>(`quotations?rfq_id=eq.${encodeURIComponent(rfq.id)}&status=in.(${visibleQuotationStatuses.join(",")})&order=revision.desc&limit=1&select=reference,revision,status,discount_percent,tax_percent,delivery_fee,validity_days,payment_terms,notes,created_at,quotation_items(product_name,sku,quantity,unit_price,is_alternative)`);
  return { rfq, quotation: quotation ?? null };
}

export async function respondToQuotation(referenceValue: string | undefined, emailValue: string | undefined, decision: "ACCEPTED" | "REJECTED" | undefined) {
  const referenceQuery = referenceValue?.trim();
  const email = emailValue?.trim();
  if (!referenceQuery || !email || !["ACCEPTED", "REJECTED"].includes(decision || "")) throw new HttpError("Invalid quotation response.", 400);
  const [quote] = await supabaseJson<Array<{ id: string; rfq_id: string; status: string; rfqs: { email: string } }>>(`quotations?reference=eq.${encodeURIComponent(referenceQuery)}&select=id,rfq_id,status,rfqs!inner(email)`);
  if (!quote || quote.rfqs.email.toLowerCase() !== email.toLowerCase()) throw new HttpError("Quotation not found.", 404);
  if (quote.status !== "SENT") throw new HttpError("This quotation is no longer awaiting a response.", 409);
  const updated = await supabaseJson<Array<{ id: string }>>(`quotations?id=eq.${encodeURIComponent(quote.id)}&status=eq.SENT`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: decision }) });
  if (!updated.length) throw new HttpError("This quotation is no longer awaiting a response.", 409);
  await supabase(`rfqs?id=eq.${encodeURIComponent(quote.rfq_id)}`, { method: "PATCH", body: JSON.stringify({ status: decision === "ACCEPTED" ? "WON" : "LOST" }) });
  await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: quote.rfq_id, quotation_id: quote.id, message: `Buyer ${decision.toLowerCase()} quotation ${referenceQuery}` }) });
  return { ok: true };
}
