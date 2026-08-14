import { errorResponse, requireAdmin, supabase } from "../../_supabase";

type QuoteItem = { requestedProductId?: string; productId?: string; productName?: string; sku?: string; quantity?: number; unitPrice?: number; isAlternative?: boolean };
type QuotePayload = { rfqId?: string; reference?: string; revision?: number; discountPercent?: number; taxPercent?: number; deliveryFee?: number; validityDays?: number; paymentTerms?: string; notes?: string; items?: QuoteItem[]; send?: boolean };

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const { id, rfqId, status } = await request.json() as { id?: string; rfqId?: string; status?: string };
    if (!id || !rfqId || !["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"].includes(status || "")) return Response.json({ error: "Invalid quotation status." }, { status: 400 });
    await supabase(`quotations?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
    const rfqStatus = status === "SENT" ? "QUOTED" : status === "ACCEPTED" ? "WON" : status === "REJECTED" ? "LOST" : null;
    if (rfqStatus) await supabase(`rfqs?id=eq.${encodeURIComponent(rfqId)}`, { method: "PATCH", body: JSON.stringify({ status: rfqStatus }) });
    await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: rfqId, quotation_id: id, message: `Quotation marked ${status}` }) });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = await request.json() as QuotePayload;
    if (!payload.rfqId || !payload.reference || !payload.items?.length) return Response.json({ error: "RFQ, quotation reference and line items are required." }, { status: 400 });
    const quoteResponse = await supabase("quotations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ rfq_id: payload.rfqId, reference: payload.reference, revision: payload.revision ?? 1, status: payload.send ? "SENT" : "DRAFT", discount_percent: payload.discountPercent ?? 0, tax_percent: payload.taxPercent ?? 0, delivery_fee: payload.deliveryFee ?? 0, validity_days: payload.validityDays ?? 14, payment_terms: payload.paymentTerms || null, notes: payload.notes || null }) });
    const [quote] = await quoteResponse.json() as Array<{ id: string }>;
    await supabase("quotation_items", { method: "POST", body: JSON.stringify(payload.items.map((item) => ({ quotation_id: quote.id, requested_product_id: item.requestedProductId || null, product_id: item.productId || null, product_name: item.productName || "Custom item", sku: item.sku || "CUSTOM", quantity: item.quantity || 1, unit_price: item.unitPrice || 0, is_alternative: Boolean(item.isAlternative) }))) });
    if (payload.send) await supabase(`rfqs?id=eq.${encodeURIComponent(payload.rfqId)}`, { method: "PATCH", body: JSON.stringify({ status: "QUOTED" }) });
    await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: payload.rfqId, quotation_id: quote.id, message: payload.send ? `Quotation ${payload.reference} sent` : `Quotation ${payload.reference} saved as draft` }) });
    if (payload.send && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const rfqResponse = await supabase(`rfqs?id=eq.${encodeURIComponent(payload.rfqId)}&select=customer_name,email`);
      const [rfq] = await rfqResponse.json() as Array<{ customer_name: string; email: string }>;
      if (rfq) {
        const subtotal = payload.items.reduce((sum, item) => sum + (item.quantity || 1) * (item.unitPrice || 0), 0);
        const total = subtotal * (1 - (payload.discountPercent || 0) / 100) * (1 + (payload.taxPercent || 0) / 100) + (payload.deliveryFee || 0);
        await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [rfq.email], subject: `Quotation ${payload.reference} is ready`, text: `Hi ${rfq.customer_name},\n\nYour quotation ${payload.reference} is ready.\nQuoted total: RM ${total.toFixed(2)}\n\nPlease reply to this email if you have any questions.\n\nSupplierFlow` }) });
      }
    }
    return Response.json({ quotationId: quote.id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
