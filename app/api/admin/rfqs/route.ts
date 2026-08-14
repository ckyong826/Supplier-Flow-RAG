import { errorResponse, requireAdmin, supabase } from "../../_supabase";

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const { id, status, note } = await request.json() as { id?: string; status?: string; note?: string };
    if (!id || (status && !["NEW", "REVIEWING", "QUOTED", "WON", "LOST"].includes(status))) return Response.json({ error: "Invalid RFQ status." }, { status: 400 });
    if (status) await supabase(`rfqs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (note?.trim()) await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: id, message: note.trim() }) });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
