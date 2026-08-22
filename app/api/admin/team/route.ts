import { audit, errorResponse, HttpError, requirePermission, requireStaff, supabase, supabaseJson, StaffRole } from "../../_supabase";

type AuthUser = { id: string; email?: string };
type AuthUsersResponse = { users?: AuthUser[] };

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    const profiles = await supabaseJson<Array<{ user_id: string; role: StaffRole }>>("profiles?select=user_id,role&order=role");
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` },
    });
    if (!response.ok) throw new Error("Could not load staff accounts.");
    const users = (await response.json() as AuthUsersResponse).users || [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return Response.json({ members: profiles.map((profile) => ({ id: profile.user_id, email: byId.get(profile.user_id)?.email || profile.user_id, role: profile.role })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await requirePermission(request, "team.manage");
    const payload = await request.json() as { id?: string; role?: StaffRole };
    if (!payload.id || !payload.role || !["owner", "admin", "manager", "sales", "operations"].includes(payload.role)) throw new HttpError("A valid staff member and role are required.", 400);
    if (payload.id === staff.id && !["owner", "admin"].includes(payload.role)) throw new HttpError("You cannot remove your own admin access.", 400);
    await supabase(`profiles?user_id=eq.${encodeURIComponent(payload.id)}`, { method: "PATCH", body: JSON.stringify({ role: payload.role }) });
    await audit(staff, { action: "team.role_changed", entityType: "profile", entityId: payload.id, metadata: { role: payload.role } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
