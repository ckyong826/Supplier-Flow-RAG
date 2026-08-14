import { errorResponse, supabase } from "../_supabase";

export async function GET() {
  try {
    const response = await supabase("products?is_active=eq.true&order=name.asc");
    return Response.json({ products: await response.json() });
  } catch (error) { return errorResponse(error); }
}
