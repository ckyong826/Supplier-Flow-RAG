import { errorResponse, requirePermission, supabaseJson } from "../../_supabase";

export async function GET(request: Request) {
  try {
    await requirePermission(request, "audit.read");
    const logs = await supabaseJson<unknown>("audit_logs?select=id,actor_id,action,entity_type,entity_id,metadata,created_at&order=created_at.desc&limit=100");
    return Response.json({ logs });
  } catch (error) { return errorResponse(error); }
}
