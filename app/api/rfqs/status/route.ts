import { getRfqStatus } from "../../_rfq";
import { errorResponse } from "../../_supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(await getRfqStatus(url.searchParams.get("reference"), url.searchParams.get("email")));
  } catch (error) { return errorResponse(error); }
}
