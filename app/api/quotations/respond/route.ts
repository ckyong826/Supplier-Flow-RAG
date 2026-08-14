import { errorResponse, supabase } from "../../_supabase";

export async function POST(request: Request) {
  try {
    const { reference, email, decision } = await request.json() as { reference?: string; email?: string; decision?: "ACCEPTED" | "REJECTED" };
    if (!reference || !email || !["ACCEPTED", "REJECTED"].includes(decision || "")) return Response.json({ error: "Invalid quotation response." }, { status: 400 });
    const quoteResponse = await supabase(`quotations?reference=eq.${encodeURIComponent(reference)}&select=id,rfq_id,status,rfqs!inner(email)`);
    const [quote] = await quoteResponse.json() as Array<{ id: string; rfq_id: string; status: string; rfqs: { email: string } }>;
    if (!quote || quote.rfqs.email.toLowerCase() !== email.toLowerCase()) return Response.json({ error: "Quotation not found." }, { status: 404 });
    if (quote.status !== "SENT") return Response.json({ error: "This quotation is no longer awaiting a response." }, { status: 409 });
    const updateResponse = await supabase(`quotations?id=eq.${encodeURIComponent(quote.id)}&status=eq.SENT`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: decision }) });
    const updated = await updateResponse.json() as Array<{ id: string }>;
    if (!updated.length) return Response.json({ error: "This quotation is no longer awaiting a response." }, { status: 409 });
    await supabase(`rfqs?id=eq.${encodeURIComponent(quote.rfq_id)}`, { method: "PATCH", body: JSON.stringify({ status: decision === "ACCEPTED" ? "WON" : "LOST" }) });
    await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: quote.rfq_id, quotation_id: quote.id, message: `Buyer ${decision.toLowerCase()} quotation ${reference}` }) });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
