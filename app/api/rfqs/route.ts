import { createRfq } from "../_rfq";
import { configurationError, errorResponse } from "../_supabase";

export async function POST(request: Request) {
  try {
    const error = configurationError(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (error) return Response.json({ error }, { status: 503 });
    return Response.json(await createRfq(await request.json()), { status: 201 });
  } catch (error) {
    console.error("RFQ submission failed", error);
    return error instanceof Error && "status" in error
      ? errorResponse(error)
      : Response.json({ error: "We could not submit the RFQ. Please try again shortly." }, { status: 500 });
  }
}
