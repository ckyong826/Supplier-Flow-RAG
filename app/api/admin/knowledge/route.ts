import { errorResponse, requireAdmin, supabase } from "../../_supabase";
import { extractPdfText } from "../pdf";

function chunks(text: string) { const words = text.trim().split(/\s+/); return Array.from({ length: Math.ceil(words.length / 180) }, (_, index) => words.slice(index * 180, (index + 1) * 180).join(" ")).filter(Boolean); }

async function embeddings(input: string[]) {
  if (!process.env.OPENAI_API_KEY) return [];
  const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input }) });
  if (!response.ok) throw new Error("Embedding request failed.");
  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((item) => item.embedding);
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id");

    // Single-document read for the View dialog. The list below deliberately omits `content`
    // so the table payload stays small, which is why the dialog has to fetch the body here.
    if (id) {
      const response = await supabase(`knowledge_documents?select=id,title,source_type,source_name,is_public,content,created_at,knowledge_chunks(count)&id=eq.${encodeURIComponent(id)}`);
      const [document] = await response.json() as Array<{ id: string }>;
      if (!document) return Response.json({ error: "Knowledge document not found." }, { status: 404 });
      return Response.json({ document });
    }

    const response = await supabase("knowledge_documents?select=id,title,source_type,source_name,is_public,created_at,knowledge_chunks(count)&order=created_at.desc");
    return Response.json({ documents: await response.json(), aiEnabled: Boolean(process.env.OPENAI_API_KEY) });
  } catch (error) {
    console.error("[admin/knowledge] read failed:", error);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const body = isMultipart ? await request.formData() : await request.json();
    const id = String(body instanceof FormData ? body.get("id") || "" : body.id || "");
    const title = String(body instanceof FormData ? body.get("title") || "" : body.title || "");
    const sourceType = String(body instanceof FormData ? body.get("sourceType") || "" : body.sourceType || "");
    const sourceName = body instanceof FormData && body.get("file") instanceof File ? (body.get("file") as File).name : undefined;
    const isPublic = body instanceof FormData ? body.get("isPublic") !== "false" : body.isPublic !== false;
    const file = body instanceof FormData ? body.get("file") : null;
    const content = file instanceof File ? await extractPdfText(file) : String(body instanceof FormData ? body.get("content") || "" : body.content || "");
    if (!title?.trim() || !content?.trim() || !["datasheet", "policy", "faq", "sop"].includes(sourceType || "")) return Response.json({ error: "Title, source type, and document text are required." }, { status: 400 });

    // Editing an existing document replaces it. Without this an edit would insert a second
    // document with the same title, leaving both sets of chunks in the index - the retriever
    // would then see the old and new text as two competing sources.
    if (id) await supabase(`knowledge_documents?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });

    const documentResponse = await supabase("knowledge_documents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: title.trim(), source_type: sourceType, source_name: sourceName || null, is_public: isPublic, content: content.trim() }) });
    const [document] = await documentResponse.json() as Array<{ id: string }>;
    const parts = chunks(content); const vectors = await embeddings(parts);
    await supabase("knowledge_chunks", { method: "POST", body: JSON.stringify(parts.map((part, index) => ({ document_id: document.id, chunk_index: index, content: part, embedding: vectors[index] || null }))) });
    return Response.json({ id: document.id, chunks: parts.length, embedded: vectors.length === parts.length, retrieval: vectors.length === parts.length ? "vector" : "keyword" }, { status: 201 });
  } catch (error) {
    console.error("[admin/knowledge] save failed:", error);
    return errorResponse(error);
  }
}
