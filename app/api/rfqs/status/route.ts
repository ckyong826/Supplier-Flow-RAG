import { getRfqStatus } from "../../_rfq";
import { errorResponse } from "../../_supabase";
import { rateLimit } from "../../_rateLimit";

export async function GET(request: Request) {
  try {
    const limited = rateLimit(request, "rfq-status", 30, 600_000);
    if (limited) return limited;
    const url = new URL(request.url);
    return Response.json(await getRfqStatus(url.searchParams.get("reference"), url.searchParams.get("email")));
  } catch (error) { return errorResponse(error); }
}
