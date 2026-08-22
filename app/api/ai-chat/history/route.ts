import { errorResponse, supabase } from "../../_supabase";
import { chatIdentity, sessionOwned } from "../_session";

export async function GET(request: Request) {
  try {
    const { sessionId, ownerToken } = chatIdentity(request);
    if (!sessionId || !(await sessionOwned(sessionId, ownerToken))) return Response.json({ messages: [] });
    const response = await supabase(`chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&select=role,content&order=created_at.asc&limit=50`);
    return Response.json({ messages: await response.json() });
  } catch (error) { return errorResponse(error); }
}
