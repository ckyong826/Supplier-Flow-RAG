import { errorResponse, supabase } from "../../_supabase";

const cookie = (id: string) => `supplierflow-chat=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;

export async function GET(request: Request) {
  try {
    const currentId = request.headers.get("cookie")?.match(/(?:^|;\s*)supplierflow-chat=([^;]+)/)?.[1] || null;
    const response = await supabase("chat_sessions?select=id,created_at,updated_at,chat_messages(role,content,created_at)&order=updated_at.desc&limit=20");
    const sessions = (await response.json() as Array<{ id: string; created_at: string; chat_messages: Array<{ role: string; content: string; created_at: string }> }>).map((session) => ({
      id: session.id,
      title: session.chat_messages.find((message) => message.role === "user")?.content.slice(0, 48) || "New conversation",
      createdAt: session.created_at,
    }));
    return Response.json({ sessions, currentId });
  } catch (error) { return errorResponse(error); }
}

export async function POST() {
  try {
    const response = await supabase("chat_sessions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({}) });
    const [session] = await response.json() as Array<{ id: string }>;
    return Response.json({ id: session.id }, { headers: { "Set-Cookie": cookie(session.id) } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const { id } = await request.json() as { id?: string };
    if (!id) return Response.json({ error: "Conversation is required." }, { status: 400 });
    const response = await supabase(`chat_sessions?id=eq.${encodeURIComponent(id)}&select=id&limit=1`);
    if (!(await response.json() as Array<{ id: string }>).length) return Response.json({ error: "Conversation not found." }, { status: 404 });
    return Response.json({ id }, { headers: { "Set-Cookie": cookie(id) } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = request.headers.get("cookie")?.match(/(?:^|;\s*)supplierflow-chat=([^;]+)/)?.[1];
    if (sessionId) await supabase(`chat_messages?session_id=eq.${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return Response.json({ cleared: true });
  } catch (error) { return errorResponse(error); }
}
