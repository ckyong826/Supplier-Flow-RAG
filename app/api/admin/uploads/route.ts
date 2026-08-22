import { errorResponse, requireAdmin } from "../../_supabase";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const data = await request.formData();
    const file = data.get("file");
    const kind = data.get("kind") === "document" ? "document" : "image";
    if (!(file instanceof File)) return Response.json({ error: "A file is required." }, { status: 400 });
    const allowed = kind === "image" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"];
    if (!allowed.includes(file.type)) return Response.json({ error: kind === "image" ? "Use JPG, PNG or WebP." : "Use a PDF datasheet." }, { status: 400 });
    const bucket = kind === "image" ? "product-images" : "documents";
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`, "Content-Type": file.type, "x-upsert": "false" }, body: await file.arrayBuffer() });
    if (!response.ok) throw new Error(await response.text());
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    return Response.json({ url, path });
  } catch (error) { return errorResponse(error); }
}
