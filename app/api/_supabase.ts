export function configurationError(names: readonly string[]) {
  const missing = names.filter((name) => !process.env[name]);
  return missing.length ? `Server configuration is incomplete: ${missing.join(", ")}.` : null;
}

export async function supabase(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(await response.text());
  return response;
}

export async function requireAdmin(request: Request) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");
  if (!url || !anon || !authorization?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
  if (!userResponse.ok) throw new Error("Unauthorized");
  const user = await userResponse.json() as { id: string; email?: string };
  const profileResponse = await supabase(`profiles?user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=user_id`, { headers: { Accept: "application/json" } });
  const profiles = await profileResponse.json() as Array<{ user_id: string }>;
  if (!profiles.length) throw new Error("Forbidden");
  return user;
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
  return Response.json({ error: status === 500 ? "The request could not be completed." : message }, { status });
}
