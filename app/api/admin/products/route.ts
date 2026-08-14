import { errorResponse, requireAdmin, supabase } from "../../_supabase";

type Product = { id?: string; name?: string; sku?: string; category?: string; summary?: string; specs?: string[]; availability?: string; imageClass?: string; imageUrl?: string | null; datasheetPath?: string | null; price?: number; isActive?: boolean };

function row(product: Product, requireId = false) {
  if ((requireId && !product.id) || !product.name?.trim() || !product.sku?.trim() || !product.category?.trim() || !product.summary?.trim()) throw new Error("Invalid product.");
  return { id: product.id || crypto.randomUUID(), name: product.name.trim(), sku: product.sku.trim(), category: product.category.trim(), summary: product.summary.trim(), specifications: product.specs ?? [], availability: product.availability ?? "In stock", image_type: product.imageClass ?? "accessory", image_url: product.imageUrl || null, datasheet_path: product.datasheetPath || null, price: Number(product.price) || 0, is_active: product.isActive !== false };
}

export async function GET(request: Request) {
  try { await requireAdmin(request); const response = await supabase("products?order=updated_at.desc"); return Response.json({ products: await response.json() }); } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try { await requireAdmin(request); const product = row(await request.json() as Product); const response = await supabase("products", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(product) }); return Response.json({ product: (await response.json())[0] }, { status: 201 }); } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try { await requireAdmin(request); const product = row(await request.json() as Product, true); const response = await supabase(`products?id=eq.${encodeURIComponent(product.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...product, updated_at: new Date().toISOString() }) }); return Response.json({ product: (await response.json())[0] }); } catch (error) { return errorResponse(error); }
}
