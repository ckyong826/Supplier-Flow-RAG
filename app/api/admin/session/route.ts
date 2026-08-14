import { configurationError, requireAdmin } from "../../_supabase";

export async function POST(request: Request) {
  try {
    const error = configurationError(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
    if (error) return Response.json({ error }, { status: 503 });
    const { email, password } = await request.json() as { email?: string; password?: string };
    if (!email?.trim() || !password) return Response.json({ error: "Email and password are required." }, { status: 400 });
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: process.env.SUPABASE_ANON_KEY!, "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!response.ok) return Response.json({ error: "Invalid email or password." }, { status: 401 });
    const session = await response.json() as { access_token: string; user: { email?: string } };
    await requireAdmin(new Request(request.url, { headers: { Authorization: `Bearer ${session.access_token}` } }));
    return Response.json({ accessToken: session.access_token, email: session.user.email });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === "Forbidden" ? "This account is not an admin." : "Sign-in could not be completed." }, { status: 403 });
  }
}
