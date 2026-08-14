import { errorResponse, requireAdmin, supabase } from "../../_supabase";

type Product = { id: string; name: string; sku: string; category: string; summary: string; specifications: string[]; availability: string; price: number };

type Source = { title: string; source_type: string; content: string; similarity: number };

function keywords(text: string) { return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1); }
async function embed(text: string) { const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input: text }) }); if (!response.ok) return null; const data = await response.json() as { data: Array<{ embedding: number[] }> }; return data.data[0]?.embedding ?? null; }
function retrieveByKeywords(message: string, chunks: Array<Source>) { const terms = keywords(message); return chunks.map((source) => ({ source, score: terms.reduce((score, term) => score + (source.content.toLowerCase().includes(term) ? 1 : 0), 0) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(({ source }) => source); }

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { message } = await request.json() as { message?: string };
    if (!message?.trim()) return Response.json({ error: "Ask a product or quotation question." }, { status: 400 });
    const products = await (await supabase("products?is_active=eq.true&select=id,name,sku,category,summary,specifications,availability,price&order=name.asc")).json() as Product[];
    const terms = keywords(message);
    const matches = products.map((product) => ({ product, score: terms.reduce((score, term) => score + (`${product.name} ${product.sku} ${product.category} ${product.summary} ${(product.specifications || []).join(" ")}`.toLowerCase().includes(term) ? 1 : 0), 0) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(({ product }) => product);
    const context = matches.map((product) => `${product.name} | SKU ${product.sku} | ${product.category} | ${product.summary} | Specs: ${(product.specifications || []).join(", ")} | Availability: ${product.availability} | Price: RM ${Number(product.price).toFixed(2)}`).join("\n");
    const fallback = matches.length ? `I found ${matches.length} matching product${matches.length === 1 ? "" : "s"}. Review the recommended items below before preparing a quotation.` : "I could not find an exact product match. Ask the customer to confirm the product type, quantity, rating, and preferred brand.";
    const vector = process.env.OPENAI_API_KEY ? await embed(message) : null;
    let sources: Source[];
    if (vector) {
      sources = await (await supabase("rpc/match_knowledge_chunks", { method: "POST", body: JSON.stringify({ query_embedding: vector, match_count: 4 }) })).json() as Source[];
    } else {
      const chunks = await (await supabase("knowledge_chunks?select=content,knowledge_documents!inner(title,source_type)&limit=100")).json() as Array<{ content: string; knowledge_documents: { title: string; source_type: string } }>;
      sources = retrieveByKeywords(message, chunks.map((chunk) => ({ content: chunk.content, title: chunk.knowledge_documents.title, source_type: chunk.knowledge_documents.source_type, similarity: 0 })));
    }
    const knowledge = sources.map((source, index) => `[${index + 1}] ${source.title} (${source.source_type}): ${source.content}`).join("\n\n");
    const prompt = `You are SupplyAI, an internal B2B wholesaler sales copilot. Use only the product facts and RAG knowledge below. Never invent stock, pricing, warranty, delivery, or technical specifications. State when information is unavailable. Give a concise staff-ready answer. Cite relevant knowledge sources as [1], [2]. If quantity is mentioned, include a quotation draft table in plain text using listed public prices and clearly label it DRAFT FOR APPROVAL.\n\nPRODUCT FACTS:\n${context || "No matching product records."}\n\nRAG KNOWLEDGE:\n${knowledge || "No relevant company knowledge found."}\n\nSTAFF ENQUIRY:\n${message}`;
    if (!process.env.DEEPSEEK_API_KEY) return Response.json({ answer: fallback, matches, sources, mode: sources.length ? "rag-search" : "database" });
    const aiResponse = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{ role: "user", content: prompt }], temperature: 0.2 }) });
    if (!aiResponse.ok) return Response.json({ answer: fallback, matches, sources, mode: sources.length ? "rag-search" : "database" });
    const ai = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
    return Response.json({ answer: ai.choices?.[0]?.message?.content || fallback, matches, sources, mode: "ai-rag" });
  } catch (error) { return errorResponse(error); }
}
