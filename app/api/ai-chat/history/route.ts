import { errorResponse, supabase } from "../../_supabase";

export async function GET(request: Request) {
  try {
    const sessionId = request.headers.get("cookie")?.match(/(?:^|;\s*)supplierflow-chat=([^;]+)/)?.[1];
    if (!sessionId) return Response.json({ messages: [] });
    const response = await supabase(`chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&select=role,content&order=created_at.asc&limit=50`);
    return Response.json({ messages: await response.json() });
  } catch (error) { return errorResponse(error); }
}
