import { errorResponse, supabase } from "../../_supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reference = url.searchParams.get("reference")?.trim();
    const email = url.searchParams.get("email")?.trim().toLowerCase();
    if (!reference || !email) return Response.json({ error: "Reference and email are required." }, { status: 400 });
    const response = await supabase(`rfqs?reference=eq.${encodeURIComponent(reference)}&email=eq.${encodeURIComponent(email)}&select=id,reference,status,created_at`);
    const [rfq] = await response.json() as Array<{ id: string; reference: string; status: string; created_at: string }>;
    if (!rfq) return Response.json({ error: "No matching RFQ was found." }, { status: 404 });
    const quoteResponse = await supabase(`quotations?rfq_id=eq.${encodeURIComponent(rfq.id)}&status=in.(SENT,ACCEPTED,REJECTED,EXPIRED)&order=revision.desc&limit=1&select=reference,revision,status,discount_percent,tax_percent,delivery_fee,validity_days,payment_terms,notes,created_at,quotation_items(product_name,sku,quantity,unit_price,is_alternative)`);
    const [quotation] = await quoteResponse.json();
    return Response.json({ rfq, quotation: quotation ?? null });
  } catch (error) { return errorResponse(error); }
}
