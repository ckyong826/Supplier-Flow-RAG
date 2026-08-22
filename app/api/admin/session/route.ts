import { configurationError, requireStaff } from "../../_supabase";
import { rateLimit } from "../../_rateLimit";

type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { email?: string };
  role?: "admin" | "sales";
};

function sessionPayload(session: SupabaseSession) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? null,
    // Absolute epoch ms so the client does not have to track when it received this.
    expiresAt: Date.now() + (Number(session.expires_in) || 3600) * 1000,
    email: session.user?.email ?? null,
    role: session.role ?? null,
  };
}

async function grant(body: Record<string, string>, grantType: "password" | "refresh_token") {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "admin-login", 10, 900_000);
    if (limited) return limited;
    const error = configurationError(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
    if (error) return Response.json({ error }, { status: 503 });

    const { email, password } = await request.json() as { email?: string; password?: string };
    if (!email?.trim() || !password) return Response.json({ error: "Email and password are required." }, { status: 400 });

    const response = await grant({ email: email.trim(), password }, "password");
    if (!response.ok) return Response.json({ error: "Invalid email or password." }, { status: 401 });

    const session = await response.json() as SupabaseSession;
    const staff = await requireStaff(new Request(request.url, { headers: { Authorization: `Bearer ${session.access_token}` } }));
    return Response.json({ ...sessionPayload(session), role: staff.role });
  } catch (error) {
    console.error("[admin/session] sign-in failed:", error);
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      { error: message.includes("not an admin") || message.includes("authorized staff") || message === "Forbidden" ? "This account is not an authorized staff account." : "Sign-in could not be completed." },
      { status: 403 },
    );
  }
}

/** Exchange a refresh token for a fresh access token so an open portal tab does not silently expire. */
export async function PUT(request: Request) {
  try {
    const error = configurationError(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
    if (error) return Response.json({ error }, { status: 503 });

    const { refreshToken } = await request.json() as { refreshToken?: string };
    if (!refreshToken) return Response.json({ error: "Session expired. Please sign in again." }, { status: 401 });

    const response = await grant({ refresh_token: refreshToken }, "refresh_token");
    if (!response.ok) return Response.json({ error: "Session expired. Please sign in again." }, { status: 401 });

    const session = await response.json() as SupabaseSession;
    const staff = await requireStaff(new Request(request.url, { headers: { Authorization: `Bearer ${session.access_token}` } }));
    return Response.json({ ...sessionPayload(session), role: staff.role });
  } catch (error) {
    console.error("[admin/session] refresh failed:", error);
    return Response.json({ error: "Session expired. Please sign in again." }, { status: 401 });
  }
}
