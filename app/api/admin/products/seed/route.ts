import { errorResponse, requireAdmin, supabase } from "../../../_supabase";
import { officialProducts } from "../../../../lib/officialCatalogue";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const existing = await (await supabase("products?select=id,sku")).json() as Array<{ id: string; sku: string }>;
    const existingIds = new Map(existing.map((product) => [product.sku, product.id]));
    await Promise.all(officialProducts.map((product) => {
      const id = existingIds.get(product.sku);
      return id
        ? supabase(`products?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...product, id, updated_at: new Date().toISOString() }) })
        : supabase("products", { method: "POST", body: JSON.stringify(product) });
    }));
    const officialSkus = officialProducts.map((product) => encodeURIComponent(product.sku)).join(",");
    const staleFilter = `products?is_active=eq.true&sku=not.in.(${officialSkus})`;
    await supabase(staleFilter, { method: "PATCH", body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }) });
    return Response.json({ archived: existing.filter((product) => !officialProducts.some((official) => official.sku === product.sku)).length, restored: officialProducts.length });
  } catch (error) { return errorResponse(error); }
}
