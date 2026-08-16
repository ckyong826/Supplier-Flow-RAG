import { respondToQuotation } from "../../_rfq";
import { errorResponse } from "../../_supabase";

export async function POST(request: Request) {
  try {
    const { reference, email, decision } = await request.json() as { reference?: string; email?: string; decision?: "ACCEPTED" | "REJECTED" };
    return Response.json(await respondToQuotation(reference, email, decision));
  } catch (error) { return errorResponse(error); }
}
