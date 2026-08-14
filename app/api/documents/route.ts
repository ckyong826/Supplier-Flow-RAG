export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.includes("..") || path.startsWith("/")) return Response.json({ error: "Invalid document path." }, { status: 400 });
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/sign/documents/${encodeURIComponent(path)}`, { method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }) });
  if (!response.ok) return Response.json({ error: "Document is unavailable." }, { status: 404 });
  const data = await response.json() as { signedURL: string };
  return Response.redirect(`${process.env.SUPABASE_URL}/storage/v1${data.signedURL}`, 302);
}
