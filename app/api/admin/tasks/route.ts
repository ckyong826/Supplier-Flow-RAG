import { audit, errorResponse, HttpError, requirePermission, supabase, supabaseJson } from "../../_supabase";

const taskTypes = ["call", "email", "follow_up", "internal"] as const;
const taskStatuses = ["open", "in_progress", "completed", "cancelled"] as const;
type TaskPayload = { id?: string; rfqId?: string | null; accountId?: string | null; assigneeId?: string | null; title?: string; taskType?: string; dueAt?: string | null; status?: string; notes?: string | null };

function normalized(payload: TaskPayload) {
  const title = payload.title?.trim();
  if (!title) throw new HttpError("Task title is required.", 400);
  if (payload.taskType && !taskTypes.includes(payload.taskType as typeof taskTypes[number])) throw new HttpError("Invalid task type.", 400);
  if (payload.status && !taskStatuses.includes(payload.status as typeof taskStatuses[number])) throw new HttpError("Invalid task status.", 400);
  return { rfq_id: payload.rfqId || null, account_id: payload.accountId || null, assignee_id: payload.assigneeId || null, title, task_type: payload.taskType || "follow_up", due_at: payload.dueAt || null, status: payload.status || "open", notes: payload.notes?.trim() || null };
}

export async function GET(request: Request) {
  try {
    await requirePermission(request, "rfq.read");
    const tasks = await supabaseJson<unknown>("crm_tasks?select=id,rfq_id,account_id,assignee_id,created_by,title,task_type,due_at,status,notes,completed_at,created_at,updated_at,rfqs(reference,company_name),customer_accounts(company_name)&order=status.asc,due_at.asc.nullslast,created_at.desc");
    return Response.json({ tasks });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const staff = await requirePermission(request, "rfq.manage");
    const task = normalized(await request.json() as TaskPayload);
    const response = await supabase("crm_tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...task, created_by: staff.id }) });
    const created = (await response.json())[0];
    await audit(staff, { action: "crm_task.created", entityType: "crm_task", entityId: created?.id, metadata: { title: task.title, rfqId: task.rfq_id } });
    return Response.json({ task: created }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const staff = await requirePermission(request, "rfq.manage");
    const payload = await request.json() as TaskPayload;
    if (!payload.id) throw new HttpError("Task id is required.", 400);
    const task = normalized(payload);
    const completedAt = task.status === "completed" ? new Date().toISOString() : null;
    await supabase(`crm_tasks?id=eq.${encodeURIComponent(payload.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...task, completed_at: completedAt, updated_at: new Date().toISOString() }) });
    await audit(staff, { action: "crm_task.updated", entityType: "crm_task", entityId: payload.id, metadata: { status: task.status } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
