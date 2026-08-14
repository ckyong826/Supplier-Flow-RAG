import { errorResponse, requireAdmin, supabase } from "../../_supabase";

function chunks(text: string) { const words = text.trim().split(/\s+/); return Array.from({ length: Math.ceil(words.length / 180) }, (_, index) => words.slice(index * 180, (index + 1) * 180).join(" ")).filter(Boolean); }

async function embeddings(input: string[]) {
  if (!process.env.OPENAI_API_KEY) return [];
  const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input }) });
  if (!response.ok) throw new Error("Embedding request failed.");
  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map((item) => item.embedding);
}

export async function GET(request: Request) {
  try { await requireAdmin(request); const response = await supabase("knowledge_documents?select=id,title,source_type,created_at,knowledge_chunks(count)&order=created_at.desc"); return Response.json({ documents: await response.json(), aiEnabled: Boolean(process.env.OPENAI_API_KEY) }); } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { title, sourceType, content } = await request.json() as { title?: string; sourceType?: string; content?: string };
    if (!title?.trim() || !content?.trim() || !["datasheet", "policy", "faq", "sop"].includes(sourceType || "")) return Response.json({ error: "Title, source type, and document text are required." }, { status: 400 });
    const documentResponse = await supabase("knowledge_documents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: title.trim(), source_type: sourceType, content: content.trim() }) });
    const [document] = await documentResponse.json() as Array<{ id: string }>;
    const parts = chunks(content); const vectors = await embeddings(parts);
    await supabase("knowledge_chunks", { method: "POST", body: JSON.stringify(parts.map((part, index) => ({ document_id: document.id, chunk_index: index, content: part, embedding: vectors[index] || null }))) });
    return Response.json({ id: document.id, chunks: parts.length, embedded: vectors.length === parts.length, retrieval: vectors.length === parts.length ? "vector" : "keyword" }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
