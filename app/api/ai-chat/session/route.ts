import { errorResponse, supabase } from "../../_supabase";
import { chatIdentity, createChatSession, sessionOwned, setChatCookies } from "../_session";

export async function GET(request: Request) {
  try {
    const { sessionId: currentId, ownerToken } = chatIdentity(request);
    if (!ownerToken) return Response.json({ sessions: [], currentId: null });
    const response = await supabase(`chat_sessions?owner_token=eq.${encodeURIComponent(ownerToken)}&select=id,created_at,updated_at,chat_messages(role,content,created_at)&order=updated_at.desc&limit=20`);
    const sessions = (await response.json() as Array<{ id: string; created_at: string; chat_messages: Array<{ role: string; content: string; created_at: string }> }>).map((session) => ({
      id: session.id,
      title: session.chat_messages.find((message) => message.role === "user")?.content.slice(0, 48) || "New conversation",
      createdAt: session.created_at,
    }));
    return Response.json({ sessions, currentId });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { ownerToken } = chatIdentity(request);
    const session = await createChatSession(ownerToken || crypto.randomUUID());
    const headers = new Headers({ "Content-Type": "application/json" });
    setChatCookies(headers, session.id, session.ownerToken);
    return new Response(JSON.stringify({ id: session.id }), { status: 200, headers });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const { id } = await request.json() as { id?: string };
    const { ownerToken } = chatIdentity(request);
    if (!id) return Response.json({ error: "Conversation is required." }, { status: 400 });
    if (!(await sessionOwned(id, ownerToken))) return Response.json({ error: "Conversation not found." }, { status: 404 });
    const headers = new Headers({ "Content-Type": "application/json" });
    setChatCookies(headers, id, ownerToken);
    return new Response(JSON.stringify({ id }), { headers });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const { sessionId, ownerToken } = chatIdentity(request);
    if (sessionId && await sessionOwned(sessionId, ownerToken)) await supabase(`chat_messages?session_id=eq.${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return Response.json({ cleared: true });
  } catch (error) { return errorResponse(error); }
}
