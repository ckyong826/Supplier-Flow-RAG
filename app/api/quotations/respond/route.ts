import { respondToQuotation } from "../../_rfq";
import { errorResponse } from "../../_supabase";
import { rateLimit } from "../../_rateLimit";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "quotation-response", 10, 600_000);
    if (limited) return limited;
    const { reference, email, decision } = await request.json() as { reference?: string; email?: string; decision?: "ACCEPTED" | "REJECTED" };
    return Response.json(await respondToQuotation(reference, email, decision));
  } catch (error) { return errorResponse(error); }
}
