import { errorResponse, requireAdmin, supabase } from "../../_supabase";

export async function GET(request: Request) {
  try { await requireAdmin(request); const response = await supabase("supplier_settings?select=*"); return Response.json({ settings: (await response.json())[0] ?? null }); } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    if (!body.company_name?.trim()) return Response.json({ error: "Company name is required." }, { status: 400 });
    const response = await supabase("supplier_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ id: true, ...body, updated_at: new Date().toISOString() }) });
    return Response.json({ settings: (await response.json())[0] });
  } catch (error) { return errorResponse(error); }
}
