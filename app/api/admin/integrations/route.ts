import { audit, errorResponse, HttpError, requireAdmin, supabase, supabaseJson } from "../../_supabase";

type Delivery = { id: string; event_type: string; target_url: string; payload: Record<string, unknown>; status: "pending" | "succeeded" | "failed"; attempts: number; last_error?: string | null; created_at: string; updated_at: string };

async function deliver(delivery: Delivery) {
  try {
    const response = await fetch(delivery.target_url, { method: "POST", headers: { "Content-Type": "application/json", "X-SupplierFlow-Event": delivery.event_type }, body: JSON.stringify(delivery.payload), signal: AbortSignal.timeout(5000) });
    return { ok: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network failure" };
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const deliveries = await supabaseJson<unknown>("integration_deliveries?select=id,event_type,target_url,status,attempts,last_error,created_at,updated_at&order=created_at.desc&limit=100");
    return Response.json({ deliveries });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const staff = await requireAdmin(request);
    const { id } = await request.json() as { id?: string };
    if (!id) throw new HttpError("Delivery id is required.", 400);
    const [delivery] = await supabaseJson<Delivery[]>(`integration_deliveries?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!delivery) throw new HttpError("Delivery not found.", 404);
    const result = await deliver(delivery);
    await supabase(`integration_deliveries?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: result.ok ? "succeeded" : "failed", attempts: Number(delivery.attempts || 0) + 1, last_error: result.error, next_attempt_at: result.ok ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() }) });
    await audit(staff, { action: result.ok ? "integration.retry_succeeded" : "integration.retry_failed", entityType: "integration_delivery", entityId: id, metadata: { eventType: delivery.event_type } });
    return Response.json({ ok: result.ok }, { status: result.ok ? 200 : 502 });
  } catch (error) { return errorResponse(error); }
}
