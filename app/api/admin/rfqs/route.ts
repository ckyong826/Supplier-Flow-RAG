import { audit, errorResponse, requirePermission, supabase, supabaseJson } from "../../_supabase";

export async function PATCH(request: Request) {
  try {
    const staff = await requirePermission(request, "rfq.manage");
    const payload = await request.json() as { id?: string; status?: string; note?: string; assignedTo?: string | null; followUpDate?: string | null };
    const { id, status, note, assignedTo, followUpDate } = payload;
    if (!id || (status && !["NEW", "REVIEWING", "QUOTED", "WON", "LOST"].includes(status))) return Response.json({ error: "Invalid RFQ status." }, { status: 400 });
    if (status) await supabase(`rfqs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (assignedTo !== undefined) {
      const normalized = assignedTo?.trim() || null;
      if (normalized && !/^[0-9a-f-]{36}$/i.test(normalized)) return Response.json({ error: "Invalid assignee." }, { status: 400 });
      if (normalized) {
        const members = await supabaseJson<Array<{ user_id: string }>>(`profiles?user_id=eq.${encodeURIComponent(normalized)}&role=in.(owner,admin,manager,sales,operations)&select=user_id`);
        if (!members.length) return Response.json({ error: "Assignee is not an active staff member." }, { status: 400 });
      }
      await supabase(`rfqs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ assigned_to: normalized }) });
    }
    if (followUpDate !== undefined) {
      const normalized = followUpDate?.trim() || null;
      if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return Response.json({ error: "Invalid follow-up date." }, { status: 400 });
      await supabase(`rfqs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ follow_up_date: normalized }) });
    }
    if (note?.trim()) await supabase("activity_logs", { method: "POST", body: JSON.stringify({ rfq_id: id, message: note.trim() }) });
    await audit(staff, { action: "rfq.updated", entityType: "rfq", entityId: id, metadata: { status: status || null, assignedTo: assignedTo === undefined ? undefined : assignedTo || null, followUpDate: followUpDate === undefined ? undefined : followUpDate || null, noteAdded: Boolean(note?.trim()) } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
