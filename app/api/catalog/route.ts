import { listActiveProducts } from "../_catalogue";
import { errorResponse } from "../_supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const products = await listActiveProducts(limit, offset);
    return Response.json({ products, hasMore: products.length === limit });
  } catch (error) { return errorResponse(error); }
}
