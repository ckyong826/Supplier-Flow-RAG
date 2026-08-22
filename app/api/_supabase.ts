export function configurationError(names: readonly string[]) {
  const missing = names.filter((name) => !process.env[name]);
  return missing.length ? `Server configuration is incomplete: ${missing.join(", ")}.` : null;
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: string) {
    super(message);
    this.name = "HttpError";
  }
}

export type StaffRole = "owner" | "admin" | "manager" | "sales" | "operations";
export type Permission =
  | "dashboard.read"
  | "rfq.read"
  | "rfq.manage"
  | "quotation.read"
  | "quotation.create"
  | "quotation.send"
  | "customer.read"
  | "customer.manage"
  | "catalogue.read"
  | "catalogue.manage"
  | "knowledge.read"
  | "knowledge.manage"
  | "settings.manage"
  | "price.manage"
  | "team.manage"
  | "audit.read";

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: [],
  admin: [],
  manager: ["dashboard.read", "rfq.read", "rfq.manage", "quotation.read", "quotation.create", "customer.read", "customer.manage", "catalogue.read", "catalogue.manage", "audit.read"],
  sales: ["dashboard.read", "rfq.read", "rfq.manage", "quotation.read", "quotation.create", "customer.read", "catalogue.read", "knowledge.read"],
  operations: ["dashboard.read", "rfq.read", "customer.read", "catalogue.read", "knowledge.read"],
};

/** Env vars every admin route needs before it can talk to Supabase at all. */
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function requireConfig(names: readonly string[] = REQUIRED_ENV) {
  const message = configurationError(names);
  if (message) throw new HttpError(message, 503);
}

/** Truncated so a huge PostgREST payload never floods the logs. */
function brief(text: string, limit = 600) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

export async function supabase(path: string, init: RequestInit = {}) {
  requireConfig(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`[supabase] network failure ${init.method ?? "GET"} ${path}:`, detail);
    throw new HttpError("Could not reach the database.", 502, detail);
  }

  if (!response.ok) {
    const detail = brief(await response.text().catch(() => ""));
    console.error(`[supabase] ${response.status} ${init.method ?? "GET"} ${path}: ${detail}`);
    // 4xx from PostgREST means our query or schema is wrong, not the caller's fault.
    throw new HttpError(
      response.status === 404 || response.status === 400
        ? "The database rejected this query. The schema may be out of date."
        : "The database request failed.",
      502,
      detail,
    );
  }
  return response;
}

export async function supabaseJson<T>(path: string, init: RequestInit = {}) {
  return await (await supabase(path, init)).json() as T;
}

/** Always returns an array, even if PostgREST hands back a scalar or object. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export async function requireStaff(request: Request, roles: readonly StaffRole[] = ["owner", "admin", "manager", "sales", "operations"]) {
  requireConfig();
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError("Unauthorized", 401);

  let userResponse: Response;
  try {
    userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("[auth] network failure verifying token:", detail);
    throw new HttpError("Could not reach the authentication service.", 502, detail);
  }
  // 401/403 here means the access token expired or was revoked — the client can recover by refreshing.
  if (!userResponse.ok) throw new HttpError("Session expired. Please sign in again.", 401);

  const user = await userResponse.json() as { id: string; email?: string };
  const profiles = await supabaseJson<Array<{ user_id: string; role: StaffRole }>>(
    `profiles?user_id=eq.${encodeURIComponent(user.id)}&role=in.(${roles.join(",")})&select=user_id,role`,
    { headers: { Accept: "application/json" } },
  );
  const profile = asArray(profiles)[0];
  if (!profile) throw new HttpError(roles.length === 1 && ["owner", "admin"].includes(roles[0]) ? "This account is not an admin." : "This account is not an authorized staff member.", 403);
  return { ...user, role: profile.role };
}

export async function requireAdmin(request: Request) {
  return requireStaff(request, ["owner", "admin"]);
}

export async function requirePermission(request: Request, permission: Permission) {
  const staff = await requireStaff(request);
  if (staff.role === "owner" || staff.role === "admin" || ROLE_PERMISSIONS[staff.role].includes(permission)) return staff;
  throw new HttpError(`Permission required: ${permission}.`, 403);
}

export async function audit(staff: { id: string }, input: { action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown> }) {
  await supabase("audit_logs", {
    method: "POST",
    body: JSON.stringify({
      actor_id: staff.id,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId || null,
      metadata: input.metadata || {},
    }),
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message, ...(error.detail && process.env.NODE_ENV !== "production" ? { detail: error.detail } : {}) },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  // Legacy string-thrown errors from older call sites.
  if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
  if (message === "Forbidden") return Response.json({ error: message }, { status: 403 });
  console.error("[admin] unhandled error:", error);
  return Response.json(
    { error: "The request could not be completed.", ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}) },
    { status: 500 },
  );
}
