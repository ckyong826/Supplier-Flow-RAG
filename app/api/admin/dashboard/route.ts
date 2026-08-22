import { asArray, errorResponse, requireStaff, supabaseJson } from "../../_supabase";

type RfqRow = { status?: string };
type QuoteRow = {
  quotation_items?: Array<{ quantity?: number | string; unit_price?: number | string }> | null;
  delivery_fee?: number | string | null;
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    const tier = new URL(request.url).searchParams.get("tier");
    const rfqFields = [
      "id", "reference", "customer_name", "company_name", "email",
      ...(tier === "starter" ? [] : ["account_id"]),
      "status", "assigned_to", "follow_up_date", "created_at", "requirements",
      "rfq_items(id,product_id,product_name,sku,quantity)",
      "activity_logs(id,message,created_at)",
    ].join(",");
    const quotationFields = [
      "id", "rfq_id", "reference", "revision", "status",
      ...(tier === "starter" ? [] : ["approval_status", "approved_by", "approved_at", "rejection_reason"]),
      "discount_percent", "tax_percent", "delivery_fee", "validity_days", "payment_terms", "notes", "created_at",
      "rfqs(reference,company_name,customer_name,email)",
      "quotation_items(product_name,sku,quantity,unit_price,is_alternative)",
    ].join(",");
    const [rfqsRaw, quotationsRaw] = await Promise.all([
      supabaseJson<unknown>(`rfqs?select=${rfqFields}&order=created_at.desc`),
      supabaseJson<unknown>(`quotations?select=${quotationFields}&order=created_at.desc`),
    ]);

    const rfqs = asArray<RfqRow>(rfqsRaw);
    const quotations = asArray<QuoteRow>(quotationsRaw);

    // Embedded rows can come back null when a relationship is empty, so never assume an array.
    const quotedValue = quotations.reduce((total, quote) => {
      const items = asArray<{ quantity?: number | string; unit_price?: number | string }>(quote.quotation_items);
      const lineTotal = items.reduce((sum, item) => sum + num(item.quantity) * num(item.unit_price), 0);
      return total + lineTotal + num(quote.delivery_fee);
    }, 0);

    return Response.json({
      rfqs,
      quotations,
      analytics: {
        totalRfqs: rfqs.length,
        openRfqs: rfqs.filter((rfq) => ["NEW", "REVIEWING"].includes(rfq.status ?? "")).length,
        quotedValue,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
