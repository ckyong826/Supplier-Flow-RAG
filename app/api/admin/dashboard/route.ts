import { errorResponse, requireAdmin, supabase } from "../../_supabase";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [rfqResponse, quoteResponse] = await Promise.all([
      supabase("rfqs?select=id,reference,customer_name,company_name,email,status,created_at,requirements,rfq_items(id,product_id,product_name,sku,quantity),activity_logs(id,message,created_at)&order=created_at.desc"),
      supabase("quotations?select=id,rfq_id,reference,revision,status,discount_percent,tax_percent,delivery_fee,validity_days,payment_terms,notes,created_at,rfqs(reference,company_name,customer_name,email),quotation_items(product_name,sku,quantity,unit_price,is_alternative)&order=created_at.desc"),
    ]);
    const rfqs = await rfqResponse.json();
    const quotations = await quoteResponse.json();
    const quotedValue = quotations.reduce((total: number, quote: { quotation_items: Array<{ quantity: number; unit_price: number }>; delivery_fee: number }) => total + quote.quotation_items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0) + Number(quote.delivery_fee), 0);
    return Response.json({ rfqs, quotations, analytics: { totalRfqs: rfqs.length, openRfqs: rfqs.filter((rfq: { status: string }) => ["NEW", "REVIEWING"].includes(rfq.status)).length, quotedValue } });
  } catch (error) { return errorResponse(error); }
}
