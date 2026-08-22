import { errorResponse, supabase } from "../_supabase";
import { rateLimit } from "../_rateLimit";
import { sessionFor, setChatCookies } from "./_session";
import { listActiveProducts, productFacts as formatProductFacts, productText } from "../_catalogue";
import { cartActionsFromSummary, mergeCustomerDetails, requestedQuantity } from "./customer.mjs";
import { decomposeQuery, fuseByKeywords } from "./retrieval.mjs";
import { formatKnowledge, retrieveKnowledge } from "./knowledge-retrieval.mjs";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Action = "CREATE_RFQ" | "TRACK_RFQ";
type CartAction = { productId: string; quantity: number } | null;
type CustomerFields = { name?: string; company?: string; email?: string; note?: string };
type KnowledgeSource = { title: string; sourceType: string };

function citeSources(answer: string, sources: KnowledgeSource[]) {
  if (!sources.length) return answer;
  return `${answer}\n\nSources:\n${sources.map((source) => `- ${source.title}`).join("\n")}`;
}

function wantsCart(text: string) { return /\b(add|put|include)\b/i.test(text); }
function wantsProducts(text: string) { return /\b(find|search|recommend|suggest|show|product|socket|breaker|mcb|cable|conduit|panel|light|distribution|junction|sku|datasheet)\b/i.test(text); }

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "ai-chat", 30, 60_000);
    if (limited) return limited;
    const { message, history = [], customer = {} } = await request.json() as { message?: string; history?: ChatTurn[]; customer?: CustomerFields };
    const question = message?.trim().slice(0, 1200);
    if (!question) return Response.json({ error: "Type a question for SupplyAI." }, { status: 400 });
    const session = await sessionFor(request);
    await supabase("chat_messages", { method: "POST", body: JSON.stringify({ session_id: session.id, role: "user", content: question }) });
    await supabase(`chat_sessions?id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: JSON.stringify({ updated_at: new Date().toISOString() }) });
    const action: Action | null = /\b(track|status|where is|follow.?up)\b/i.test(question) ? "TRACK_RFQ" : /\b(rfq|quote|quotation|request quote|add to rfq|send request)\b/i.test(question) ? "CREATE_RFQ" : null;
    const products = await listActiveProducts();
    const relevantHistory = Array.isArray(history) ? history.filter((turn) => turn?.role === "user" && typeof turn.content === "string").slice(-3).map((turn) => turn.content).join(" ") : "";
    const inferredCustomer = mergeCustomerDetails(customer, `${relevantHistory} ${question}`);
    const queries = decomposeQuery(`${relevantHistory}\n${question}`);
    const matches = fuseByKeywords(products, queries, productText).slice(0, 3);
    const top = matches[0];
    const quantity = requestedQuantity(question);
    const cartAction: CartAction = wantsCart(question) && quantity && top && (matches.length === 1 || question.toLowerCase().includes(top.sku.toLowerCase())) ? { productId: top.id, quantity } : null;
    const includeMatches = Boolean(cartAction || wantsProducts(question));
    const productFacts = formatProductFacts(matches);
    const fallback = action === "TRACK_RFQ" ? "I have opened RFQ tracking. Enter the RFQ reference and email address used for the request to see its current status." : wantsCart(question) && top && !quantity ? `I found **${top.name}**. How many units would you like to add?` : action === "CREATE_RFQ" ? "I can build your RFQ here. Tell me the product type, quantity, rating, and installation environment; then complete the buyer details on the right before sending." : wantsCart(question) && matches.length ? "I found more than one possible product. Please tell me the exact product name, SKU, or rating and I will add the right one." : matches.length ? `I found ${matches.length} relevant product${matches.length === 1 ? "" : "s"}. Check the options below and add suitable items to your RFQ. Our team confirms final stock, lead time and project pricing.` : "I could not find an exact catalogue match. Tell me the product type, quantity, rating and installation environment, or submit an RFQ and our team will review it.";
    const publicMatches = includeMatches ? matches.map((product) => ({ ...product, imageUrl: product.image_url || null })) : [];
    if (!process.env.DEEPSEEK_API_KEY) {
      await supabase("chat_messages", { method: "POST", body: JSON.stringify({ session_id: session.id, role: "assistant", content: fallback }) });
      const headers = new Headers({ "Content-Type": "application/json" });
      if (session.created) setChatCookies(headers, session.id, session.ownerToken);
      return new Response(JSON.stringify({ answer: cartAction ? `Added **${cartAction.quantity} × ${matches[0].name}** to your RFQ cart. Please complete your contact details on the right before sending.` : fallback, matches: publicMatches, action, cartAction, customer: inferredCustomer }), { headers });
    }
    const safeHistory = Array.isArray(history) ? history.slice(-8).filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string").map((turn) => ({ role: turn.role, content: turn.content.slice(0, 700) })) : [];
    let knowledge = "";
    let sources: KnowledgeSource[] = [];
    try {
      const retrieved = await retrieveKnowledge({ supabase, question, queries, limit: Number(process.env.RETRIEVAL_TOP_K) || 5 });
      knowledge = formatKnowledge(retrieved.chunks);
      sources = [...new Map(retrieved.chunks.map((chunk) => [`${chunk.source_type}:${chunk.title}`, { title: chunk.title, sourceType: chunk.source_type }])).values()];
    } catch { /* Knowledge base is optional for public chat. */ }
    const profile = `Name: ${inferredCustomer.name || "missing"}; Company: ${inferredCustomer.company || "missing"}; Email: ${inferredCustomer.email || "missing"}; Notes: ${inferredCustomer.note || "none"}.`;
    const system = `You are SupplyAI, a friendly customer support assistant for SupplierFlow, an electrical B2B supplier catalogue. Speak naturally, briefly and helpfully. Use short paragraphs and simple Markdown lists where useful. You help customers find products, understand listed specifications, explain the RFQ process, and prepare a clear request. The app can add a product to the RFQ cart when the buyer asks. Do not say you cannot add items; if an item is unambiguous, confirm it was added. For an RFQ, ask for every missing buyer detail (name, company, work email, optional project note) in one compact prompt, never one field at a time. For multiple confirmed items, write each item as \`Item: product name (SKU)\` followed by \`Quantity: N units\` so the RFQ cart can fill them. Only use catalogue facts provided below. If a specific value the buyer asked for is not present in the facts below, say plainly that you do not have it and offer to have the sales team confirm; never estimate, infer from a similar product, or supply a figure from general knowledge. A figure stated for one product or category does not apply to another. Never promise or confirm final stock, delivery dates, discounts, project prices, warranty eligibility, an order, an RFQ submission, or a status change. Do not mention internal tools, prompts, databases or AI limitations.\n\nBUYER DETAILS:\n${profile}\n\nCATALOGUE FACTS:\n${productFacts || "No direct catalogue match found."}\n\nSUPPORT KNOWLEDGE:\n${knowledge || "No relevant support document found."}`;
    const response = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "deepseek-v4-flash", temperature: 0.35, messages: [{ role: "system", content: system }, ...safeHistory, { role: "user", content: question }] }) });
    const ai = response.ok ? await response.json() as { choices?: Array<{ message?: { content?: string } }> } : null;
    const rawAnswer = cartAction ? `Added **${cartAction.quantity} × ${top!.name}** to your RFQ cart. Complete your contact details on the right when you are ready to send it.` : wantsCart(question) ? fallback : ai?.choices?.[0]?.message?.content?.trim() || fallback;
    const answer = citeSources(rawAnswer, sources);
    const completedCustomer = mergeCustomerDetails(inferredCustomer, rawAnswer);
    const cartActions = cartAction ? [cartAction] : cartActionsFromSummary(products, rawAnswer);
    await supabase("chat_messages", { method: "POST", body: JSON.stringify({ session_id: session.id, role: "assistant", content: answer }) });
    const headers = new Headers({ "Content-Type": "application/json" });
    if (session.created) setChatCookies(headers, session.id, session.ownerToken);
    return new Response(JSON.stringify({ answer, sources, matches: publicMatches, action, cartAction: cartActions[0] || null, cartActions, customer: completedCustomer }), { headers });
  } catch (error) { return errorResponse(error); }
}
