import { audit, errorResponse, HttpError, requirePermission, supabase, supabaseJson } from "../../_supabase";

type InventoryPayload = { mode?: "adjust" | "reserve" | "release"; productId?: string; delta?: number; reason?: string; reference?: string; quantity?: number; rfqId?: string | null; accountId?: string | null; expiresAt?: string | null; reservationId?: string };

export async function GET(request: Request) {
  try {
    await requirePermission(request, "catalogue.read");
    const [products, reservations, movements] = await Promise.all([
      supabaseJson<unknown>("products?select=id,name,sku,stock_quantity,availability,is_active&order=name.asc"),
      supabaseJson<unknown>("inventory_reservations?select=id,product_id,rfq_id,account_id,quantity,status,expires_at,created_at&order=created_at.desc&limit=100"),
      supabaseJson<unknown>("inventory_movements?select=id,product_id,quantity_delta,reason,reference,actor_id,created_at&order=created_at.desc&limit=100"),
    ]);
    return Response.json({ products, reservations, movements });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const staff = await requirePermission(request, "catalogue.manage");
    const payload = await request.json() as InventoryPayload;
    const mode = payload.mode || "adjust";
    if (!payload.productId) throw new HttpError("Product is required.", 400);
    if (mode === "adjust") {
      const delta = Number(payload.delta);
      if (!Number.isInteger(delta) || delta === 0 || !["receipt", "adjustment", "sale", "correction"].includes(payload.reason || "")) throw new HttpError("Quantity and a valid inventory reason are required.", 400);
      const [product] = await supabaseJson<Array<{ stock_quantity: number | null }>>(`products?id=eq.${encodeURIComponent(payload.productId)}&select=stock_quantity`);
      const current = Number(product?.stock_quantity);
      if (!product || !Number.isFinite(current) || current + delta < 0) throw new HttpError("Inventory cannot go below zero.", 400);
      await supabase(`products?id=eq.${encodeURIComponent(payload.productId)}`, { method: "PATCH", body: JSON.stringify({ stock_quantity: current + delta, updated_at: new Date().toISOString() }) });
      await supabase("inventory_movements", { method: "POST", body: JSON.stringify({ product_id: payload.productId, quantity_delta: delta, reason: payload.reason, reference: payload.reference?.trim() || null, actor_id: staff.id }) });
      await audit(staff, { action: "inventory.adjusted", entityType: "product", entityId: payload.productId, metadata: { delta, reason: payload.reason } });
      return Response.json({ ok: true });
    }
    if (mode === "reserve") {
      const quantity = Number(payload.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new HttpError("A positive reservation quantity is required.", 400);
      const [product] = await supabaseJson<Array<{ stock_quantity: number | null }>>(`products?id=eq.${encodeURIComponent(payload.productId)}&select=stock_quantity`);
      const active = await supabaseJson<Array<{ quantity: number; expires_at?: string | null }>>(`inventory_reservations?product_id=eq.${encodeURIComponent(payload.productId)}&status=eq.reserved&select=quantity,expires_at`);
      const now = Date.now();
      const reserved = active.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      if (!product || product.stock_quantity === null || Number(product.stock_quantity) - reserved < quantity) throw new HttpError("Not enough available stock to reserve.", 409);
      const created = await supabaseJson<unknown>("inventory_reservations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ product_id: payload.productId, rfq_id: payload.rfqId || null, account_id: payload.accountId || null, quantity, expires_at: payload.expiresAt || null, created_by: staff.id }) });
      await audit(staff, { action: "inventory.reserved", entityType: "inventory_reservation", metadata: { productId: payload.productId, quantity } });
      return Response.json({ reservation: Array.isArray(created) ? created[0] : created }, { status: 201 });
    }
    if (mode === "release") {
      if (!payload.reservationId) throw new HttpError("Reservation id is required.", 400);
      await supabase(`inventory_reservations?id=eq.${encodeURIComponent(payload.reservationId)}&status=eq.reserved`, { method: "PATCH", body: JSON.stringify({ status: "released", updated_at: new Date().toISOString() }) });
      await audit(staff, { action: "inventory.released", entityType: "inventory_reservation", entityId: payload.reservationId });
      return Response.json({ ok: true });
    }
    throw new HttpError("Invalid inventory action.", 400);
  } catch (error) { return errorResponse(error); }
}
