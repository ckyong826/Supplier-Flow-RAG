import { audit, errorResponse, HttpError, requireAdmin, requirePermission, supabase, supabaseJson } from "../../_supabase";

type QuoteItem = { requestedProductId?: string; productId?: string; productName?: string; sku?: string; quantity?: number; unitPrice?: number; isAlternative?: boolean };
type QuotePayload = { rfqId?: string; reference?: string; revision?: number; companyName?: string; discountPercent?: number; taxPercent?: number; deliveryFee?: number; validityDays?: number; paymentTerms?: string; notes?: string; items?: QuoteItem[]; send?: boolean };
type ProductStatus = { id: string; availability?: string | null; stock_quantity?: number | null; is_active?: boolean | null };

function money(value: number) {
  return `RM ${Number(value).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function quoteValues(items: QuoteItem[], discountPercent: number, taxPercent: number, deliveryFee: number) {
  const subtotal = items.reduce((sum, item) => sum + numberValue(item.quantity || 1) * numberValue(item.unitPrice), 0);
  const discount = subtotal * numberValue(discountPercent) / 100;
  const taxable = subtotal - discount;
  const tax = taxable * numberValue(taxPercent) / 100;
  return { subtotal, discount, taxable, tax, delivery: numberValue(deliveryFee), total: taxable + tax + numberValue(deliveryFee) };
}

async function currentProductStatuses(items: QuoteItem[]) {
  const ids = [...new Set(items.map((item) => item.productId || item.requestedProductId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, ProductStatus>();
  try {
    const response = await supabase(`products?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,availability,stock_quantity,is_active`);
    return new Map((await response.json() as ProductStatus[]).map((product) => [product.id, product]));
  } catch (error) {
    console.error("Could not load current product statuses for quotation email", error);
    return new Map<string, ProductStatus>();
  }
}

function itemStatus(item: QuoteItem, statuses: Map<string, ProductStatus>) {
  const product = statuses.get(item.productId || item.requestedProductId || "");
  if (!product) return item.productId || item.requestedProductId ? "No longer listed" : "Custom item";
  if (product.is_active === false) return "Catalogue hidden";
  if (product.stock_quantity !== null && product.stock_quantity !== undefined) return product.stock_quantity > 0 ? `${product.availability || "In stock"} · ${product.stock_quantity} available` : "Out of stock";
  return product.availability || "Check availability";
}

function quotationEmailHtml(input: {
  companyName: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  reference: string;
  revision: number;
  status: string;
  validityDays: number;
  paymentTerms?: string;
  notes?: string;
  items: Array<QuoteItem & { currentStatus: string }>;
  values: ReturnType<typeof quoteValues>;
}) {
  const rows = input.items.map((item) => `<tr>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;color:#0f172a;font-weight:700;vertical-align:top">${escapeHtml(item.productName || "Custom item")}<br><span style="color:#64748b;font-size:12px;font-weight:400">${escapeHtml(item.sku || "CUSTOM")}${item.isAlternative ? " · Alternative" : ""}</span></td>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;vertical-align:top"><span style="display:inline-block;padding:5px 8px;border:1px solid #c7d2fe;border-radius:999px;color:#4338ca;font-size:11px;white-space:nowrap">${escapeHtml(item.currentStatus)}</span></td>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;color:#334155;vertical-align:top">${numberValue(item.quantity || 1)}</td>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;color:#334155;white-space:nowrap;vertical-align:top">${money(numberValue(item.unitPrice))}</td>
    <td style="padding:14px 10px;border-top:1px solid #e2e8f0;color:#0f172a;font-weight:700;text-align:right;white-space:nowrap;vertical-align:top">${money(numberValue(item.quantity || 1) * numberValue(item.unitPrice))}</td>
  </tr>`).join("");
  const message = input.notes?.trim()
    ? `<table role="presentation" width="100%" style="margin-top:24px;border:1px solid #c7d2fe;border-radius:10px;background:#eef2ff"><tr><td style="padding:16px 18px"><p style="margin:0 0 7px;color:#4338ca;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Message from your quote desk</p><p style="margin:0;color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(input.notes)}</p></td></tr></table>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quotation ${escapeHtml(input.reference)}</title></head><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc"><tr><td style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px"><tr><td style="padding:30px 32px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><p style="margin:0;color:#64748b;font-size:11px;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(input.companyName)} / Quotation</p><h1 style="margin:12px 0 8px;color:#0f172a;font-size:28px;line-height:1.2">Your quotation is ready</h1><p style="margin:0;color:#64748b;font-size:14px;line-height:1.5">${escapeHtml(input.customerName)}${input.customerCompany ? `, ${escapeHtml(input.customerCompany)}` : ""}<br>${escapeHtml(input.customerEmail)}</p></td><td align="right" valign="top"><span style="display:inline-block;padding:7px 10px;border:1px solid #c7d2fe;border-radius:999px;color:#4338ca;font-size:11px;font-weight:700;letter-spacing:.08em">${escapeHtml(input.status)}</span></td></tr></table>
    <p style="margin:22px 0 0;color:#64748b;font-family:monospace;font-size:12px;letter-spacing:.04em">${escapeHtml(input.reference)} · Revision ${input.revision}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-top:1px solid #e2e8f0;border-collapse:collapse"><thead><tr><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Item</th><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Current status</th><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Qty</th><th align="left" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Unit price</th><th align="right" style="padding:12px 10px;color:#64748b;font-family:monospace;font-size:11px;font-weight:400;text-transform:uppercase">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;border-top:1px solid #e2e8f0"><tr><td></td><td width="300" style="padding-top:12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:6px 0;color:#64748b;font-size:14px">Subtotal</td><td align="right" style="padding:6px 0;color:#334155;font-size:14px">${money(input.values.subtotal)}</td></tr><tr><td style="padding:6px 0;color:#64748b;font-size:14px">Discount</td><td align="right" style="padding:6px 0;color:#334155;font-size:14px">- ${money(input.values.discount)}</td></tr><tr><td style="padding:6px 0;color:#64748b;font-size:14px">Taxable amount</td><td align="right" style="padding:6px 0;color:#334155;font-size:14px">${money(input.values.taxable)}</td></tr><tr><td style="padding:6px 0;color:#64748b;font-size:14px">SST</td><td align="right" style="padding:6px 0;color:#334155;font-size:14px">${money(input.values.tax)}</td></tr><tr><td style="padding:6px 0;color:#64748b;font-size:14px">Delivery</td><td align="right" style="padding:6px 0;color:#334155;font-size:14px">${money(input.values.delivery)}</td></tr><tr><td style="padding:14px 0 0;border-top:1px solid #e2e8f0;color:#0f172a;font-size:18px">Grand total</td><td align="right" style="padding:14px 0 0;border-top:1px solid #e2e8f0;color:#0f172a;font-size:22px;font-weight:700">${money(input.values.total)}</td></tr></table></td></tr></table>
    ${message}
    <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">This quotation is valid for ${input.validityDays} days${input.paymentTerms ? ` and follows ${escapeHtml(input.paymentTerms)} payment terms` : ""}. Reply to this email if you need any changes or clarification.</p>
    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px">${escapeHtml(input.companyName)}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

function quotationEmailText(input: {
  companyName: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  reference: string;
  revision: number;
  validityDays: number;
  paymentTerms?: string;
  notes?: string;
  items: Array<QuoteItem & { currentStatus: string }>;
  values: ReturnType<typeof quoteValues>;
}) {
  const items = input.items.map((item) => `- ${item.productName || "Custom item"} (${item.sku || "CUSTOM"})\n  Status: ${item.currentStatus}\n  Qty: ${numberValue(item.quantity || 1)} | Unit price: ${money(numberValue(item.unitPrice))} | Total: ${money(numberValue(item.quantity || 1) * numberValue(item.unitPrice))}`).join("\n");
  return [`Hi ${input.customerName},`, "", `Your quotation ${input.reference}, revision ${input.revision}, is ready for ${input.customerCompany || "your company"}.`, "", "ITEMS", items, "", "PRICE BREAKDOWN", `Subtotal: ${money(input.values.subtotal)}`, `Discount: - ${money(input.values.discount)}`, `Taxable amount: ${money(input.values.taxable)}`, `SST: ${money(input.values.tax)}`, `Delivery: ${money(input.values.delivery)}`, `Grand total: ${money(input.values.total)}`, input.notes?.trim() ? `\nMESSAGE FROM YOUR QUOTE DESK\n${input.notes.trim()}` : "", "", `This quotation is valid for ${input.validityDays} days${input.paymentTerms ? ` and follows ${input.paymentTerms} payment terms` : ""}. Reply to this email if you need any changes or clarification.`, "", input.companyName].join("\n");
}

export async function PATCH(request: Request) {
  try {
    const { id, rfqId, status, approvalStatus, rejectionReason } = await request.json() as { id?: string; rfqId?: string; status?: string; approvalStatus?: string; rejectionReason?: string };
    if (approvalStatus) {
      const staff = await requireAdmin(request);
      if (!id || !["approved", "rejected", "pending"].includes(approvalStatus)) return Response.json({ error: "Invalid approval status." }, { status: 400 });
      if (approvalStatus === "approved" && status === "SENT" && !rfqId) throw new HttpError("RFQ id is required when sending an approved quotation.", 400);
      await supabase(`quotations?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: status === "SENT" ? "SENT" : undefined, approval_status: approvalStatus, approved_by: approvalStatus === "approved" ? staff.id : null, approved_at: approvalStatus === "approved" ? new Date().toISOString() : null, rejection_reason: approvalStatus === "rejected" ? rejectionReason?.trim() || null : null, updated_at: new Date().toISOString() }) });
      if (status === "SENT") {
        await supabase(`rfqs?id=eq.${encodeURIComponent(rfqId!)}`, { method: "PATCH", body: JSON.stringify({ status: "QUOTED" }) });
        await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: rfqId, quotation_id: id, message: "Quotation approved and sent" }) });
      }
      await audit(staff, { action: `quotation.${approvalStatus}`, entityType: "quotation", entityId: id, metadata: { rejectionReason: approvalStatus === "rejected" ? rejectionReason?.trim() || null : null } });
      return Response.json({ ok: true });
    }
    if (!id || !rfqId || !["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"].includes(status || "")) return Response.json({ error: "Invalid quotation status." }, { status: 400 });
    const staff = await requirePermission(request, status === "SENT" ? "quotation.send" : "quotation.create");
    if (status === "SENT" && staff.role !== "owner" && staff.role !== "admin") throw new HttpError("Admin approval is required before sending a quotation.", 403);
    await supabase(`quotations?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, approval_status: status === "SENT" ? "approved" : undefined, approved_by: status === "SENT" ? staff.id : undefined, approved_at: status === "SENT" ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() }) });
    const rfqStatus = status === "SENT" ? "QUOTED" : status === "ACCEPTED" ? "WON" : status === "REJECTED" ? "LOST" : null;
    if (rfqStatus) await supabase(`rfqs?id=eq.${encodeURIComponent(rfqId)}`, { method: "PATCH", body: JSON.stringify({ status: rfqStatus }) });
    await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: rfqId, quotation_id: id, message: `Quotation marked ${status}` }) });
    await audit(staff, { action: `quotation.${status!.toLowerCase()}`, entityType: "quotation", entityId: id, metadata: { rfqId } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as QuotePayload;
    if (!payload.rfqId || !payload.reference || !payload.items?.length) return Response.json({ error: "RFQ, quotation reference and line items are required." }, { status: 400 });
    const staff = await requirePermission(request, payload.send ? "quotation.send" : "quotation.create");
    const [latest] = await supabaseJson<Array<{ revision: number }>>(`quotations?rfq_id=eq.${encodeURIComponent(payload.rfqId)}&select=revision&order=revision.desc&limit=1`);
    if (latest && Number(payload.revision || 1) <= Number(latest.revision)) throw new HttpError("Quotation revisions must increase.", 409);
    const notes = payload.notes?.trim().slice(0, 2000) || null;
    const quoteResponse = await supabase("quotations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ rfq_id: payload.rfqId, reference: payload.reference, revision: payload.revision ?? 1, status: payload.send ? "SENT" : "DRAFT", approval_status: payload.send ? "approved" : "pending", approved_by: payload.send ? staff.id : null, approved_at: payload.send ? new Date().toISOString() : null, discount_percent: payload.discountPercent ?? 0, tax_percent: payload.taxPercent ?? 0, delivery_fee: payload.deliveryFee ?? 0, validity_days: payload.validityDays ?? 14, payment_terms: payload.paymentTerms || null, notes }) });
    const [quote] = await quoteResponse.json() as Array<{ id: string }>;
    await supabase("quotation_items", { method: "POST", body: JSON.stringify(payload.items.map((item) => ({ quotation_id: quote.id, requested_product_id: item.requestedProductId || null, product_id: item.productId || null, product_name: item.productName || "Custom item", sku: item.sku || "CUSTOM", quantity: item.quantity || 1, unit_price: item.unitPrice || 0, is_alternative: Boolean(item.isAlternative) }))) });
    if (payload.send) await supabase(`rfqs?id=eq.${encodeURIComponent(payload.rfqId)}`, { method: "PATCH", body: JSON.stringify({ status: "QUOTED" }) });
    await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: payload.rfqId, quotation_id: quote.id, message: payload.send ? `Quotation ${payload.reference} sent` : `Quotation ${payload.reference} saved as draft` }) });
    await audit(staff, { action: payload.send ? "quotation.sent" : "quotation.created", entityType: "quotation", entityId: quote.id, metadata: { rfqId: payload.rfqId, reference: payload.reference, revision: payload.revision ?? 1 } });
    if (payload.send && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      const rfqResponse = await supabase(`rfqs?id=eq.${encodeURIComponent(payload.rfqId)}&select=customer_name,company_name,email`);
      const [rfq] = await rfqResponse.json() as Array<{ customer_name: string; company_name: string; email: string }>;
      if (rfq) {
        const statuses = await currentProductStatuses(payload.items);
        const items = payload.items.map((item) => ({ ...item, currentStatus: itemStatus(item, statuses) }));
        const values = quoteValues(payload.items, payload.discountPercent || 0, payload.taxPercent || 0, payload.deliveryFee || 0);
        const emailInput = { companyName: payload.companyName || "SupplierFlow", customerName: rfq.customer_name, customerEmail: rfq.email, customerCompany: rfq.company_name, reference: payload.reference, revision: payload.revision ?? 1, status: "SENT", validityDays: payload.validityDays ?? 14, paymentTerms: payload.paymentTerms, notes: notes || undefined, items, values };
        const emailResponse = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [rfq.email], subject: `Quotation ${payload.reference} is ready`, html: quotationEmailHtml(emailInput), text: quotationEmailText(emailInput) }) });
        if (!emailResponse.ok) console.error("Quotation email failed", await emailResponse.text());
      }
    }
    return Response.json({ quotationId: quote.id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
