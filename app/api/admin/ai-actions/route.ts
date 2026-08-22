import { audit, errorResponse, HttpError, requireAdmin, requirePermission, supabase, supabaseJson } from "../../_supabase";

type ActionPayload = { id?: string; actionType?: string; rfqId?: string | null; title?: string; dueAt?: string | null; taskType?: string; status?: "approved" | "rejected" };

export async function GET(request: Request) {
  try {
    await requirePermission(request, "audit.read");
    const actions = await supabaseJson<unknown>("ai_action_runs?select=id,action_type,rfq_id,requested_by,approved_by,status,input,result,error,created_at,updated_at&order=created_at.desc&limit=100");
    return Response.json({ actions });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const staff = await requirePermission(request, "rfq.manage");
    const payload = await request.json() as ActionPayload;
    if (payload.actionType !== "create_follow_up_task" || !payload.title?.trim()) throw new HttpError("A follow-up action and title are required.", 400);
    const input = { title: payload.title.trim(), dueAt: payload.dueAt || null, taskType: payload.taskType || "follow_up" };
    const created = await supabaseJson<unknown>("ai_action_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ action_type: payload.actionType, rfq_id: payload.rfqId || null, requested_by: staff.id, input }) });
    const action = Array.isArray(created) ? created[0] : created;
    await audit(staff, { action: "ai_action.proposed", entityType: "ai_action_run", entityId: (action as { id?: string })?.id, metadata: { actionType: payload.actionType, rfqId: payload.rfqId } });
    return Response.json({ action }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const staff = await requireAdmin(request);
    const payload = await request.json() as ActionPayload;
    if (!payload.id || !payload.status || !["approved", "rejected"].includes(payload.status)) throw new HttpError("Action id and decision are required.", 400);
    const [action] = await supabaseJson<Array<{ id: string; action_type: string; rfq_id?: string | null; input: { title?: string; dueAt?: string | null; taskType?: string }; status: string }>>(`ai_action_runs?id=eq.${encodeURIComponent(payload.id)}&select=id,action_type,rfq_id,input,status`);
    if (!action || action.status !== "pending") throw new HttpError("This AI action is no longer pending.", 409);
    if (payload.status === "rejected") {
      await supabase(`ai_action_runs?id=eq.${encodeURIComponent(payload.id)}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", approved_by: staff.id, updated_at: new Date().toISOString() }) });
      await audit(staff, { action: "ai_action.rejected", entityType: "ai_action_run", entityId: payload.id });
      return Response.json({ ok: true });
    }
    const task = await supabaseJson<unknown>("crm_tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ rfq_id: action.rfq_id || null, title: action.input.title, task_type: action.input.taskType || "follow_up", due_at: action.input.dueAt || null, created_by: staff.id, notes: "Created from approved AI action." }) });
    const taskRow = Array.isArray(task) ? task[0] : task;
    await supabase(`ai_action_runs?id=eq.${encodeURIComponent(payload.id)}`, { method: "PATCH", body: JSON.stringify({ status: "executed", approved_by: staff.id, result: { taskId: (taskRow as { id?: string })?.id }, updated_at: new Date().toISOString() }) });
    await audit(staff, { action: "ai_action.executed", entityType: "ai_action_run", entityId: payload.id, metadata: { taskId: (taskRow as { id?: string })?.id } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
