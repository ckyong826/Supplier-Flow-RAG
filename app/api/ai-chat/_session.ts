import { supabase } from "../_supabase";

const SESSION_COOKIE = "supplierflow-chat";
const OWNER_COOKIE = "supplierflow-chat-owner";

function cookieValue(request: Request, name: string) {
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] || "";
}

export function chatIdentity(request: Request) {
  return {
    sessionId: cookieValue(request, SESSION_COOKIE),
    ownerToken: cookieValue(request, OWNER_COOKIE),
  };
}

export function setChatCookies(headers: Headers, sessionId: string, ownerToken: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append("Set-Cookie", `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  headers.append("Set-Cookie", `${OWNER_COOKIE}=${ownerToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}

export async function sessionOwned(sessionId: string, ownerToken: string) {
  if (!sessionId || !ownerToken) return false;
  const response = await supabase(`chat_sessions?id=eq.${encodeURIComponent(sessionId)}&owner_token=eq.${encodeURIComponent(ownerToken)}&select=id&limit=1`);
  return (await response.json() as Array<{ id: string }>).length > 0;
}

export async function createChatSession(ownerToken = crypto.randomUUID()) {
  const response = await supabase("chat_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_token: ownerToken }),
  });
  const [session] = await response.json() as Array<{ id: string }>;
  return { id: session.id, ownerToken };
}

export async function sessionFor(request: Request) {
  const identity = chatIdentity(request);
  if (await sessionOwned(identity.sessionId, identity.ownerToken)) {
    return { id: identity.sessionId, ownerToken: identity.ownerToken, created: false };
  }
  const created = await createChatSession(identity.ownerToken || crypto.randomUUID());
  return { ...created, created: true };
}
