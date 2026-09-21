import { errorResponse, supabase } from "../_supabase";
import { rateLimit } from "../_rateLimit";
import { sessionFor, setChatCookies } from "./_session";
import {
  listActiveProducts,
  productFacts as formatProductFacts,
  productText,
} from "../_catalogue";
import type { CatalogueProduct } from "../_catalogue";
import {
  cartActionsFromSummary,
  mergeCustomerDetails,
  requestedQuantity,
} from "./customer.mjs";
import { decomposeQuery, fuseByKeywords, rewriteQuery } from "./retrieval.mjs";
import { formatKnowledge, retrieveKnowledge } from "./knowledge-retrieval.mjs";
import { hypotheticalQuery } from "./query-rewrite.mjs";
import { routeQuery } from "./decision-router/router.mjs";
import { getDecisionConfig } from "./decision-router/config.mjs";
import { resolveRetrievalQuery } from "./decision-router/conversation.mjs";
import { buildRetrievalPlan } from "./decision-router/planner.mjs";
import {
  aggregateEvidence,
  executePlan,
} from "./decision-router/orchestrator.mjs";
import { createDiagnostics } from "./decision-router/diagnostics.mjs";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Action = "CREATE_RFQ" | "TRACK_RFQ";
type CartAction = { productId: string; quantity: number } | null;
type CustomerFields = {
  name?: string;
  company?: string;
  email?: string;
  note?: string;
};
type KnowledgeSource = { title: string; sourceType: string };
type RetrievedChunk = { content: string; title: string; source_type: string; similarity: number | null };
type RetrievalResult = {
  mode: string;
  requestedMode?: string;
  gated?: boolean;
  degradedReason?: string | null;
  rerankMode?: string | null;
  candidateCount?: number;
  representation?: string;
  chunks: RetrievedChunk[];
};
type ModelUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};
// SF-JEV: decision-router boundary shapes. The router modules are untyped
// .mjs; these interfaces keep the chat route strictly typed.
type RouterSkuMatch = { sku: string; id: string; product: CatalogueProduct };
type DecisionRouting = {
  normalized?: {
    decisions: Record<string, boolean>;
    detectedIntents: string[];
    confidences: Record<string, number>;
  } | null;
  source?: string;
  strategy?: "legacy" | "multi";
  jevAttempted?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  complexity?: { complex: boolean; reasons: string[] } | null;
  context?: string;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  skus?: {
    productIds: string[];
    unknown: string[];
    matched: RouterSkuMatch[];
  };
};
type GenerationResult = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: ModelUsage;
  model?: string;
};
type RetrievalOperationShape = {
  type: string;
  query: string;
  productIds?: string[];
  priority: number;
};
type RetrievalPlanShape = {
  requiresRetrieval: boolean;
  operations: RetrievalOperationShape[];
  requiresQueryRewrite: boolean;
  requiresConversationContext: boolean;
  detectedIntents: string[];
};
type EvidenceShape = {
  documents: RetrievedChunk[];
  products: string[];
  completedOperations: string[];
  failedOperations: string[];
  missingInformation: string[];
};

function citeSources(answer: string, sources: KnowledgeSource[]) {
  if (!sources.length) return answer;
  return `${answer}\n\nSources:\n${sources.map((source) => `- ${source.title}`).join("\n")}`;
}

function wantsCart(text: string) {
  return (
    /\b(add|put|include)\b[\s\S]{0,40}\b(cart|rfq|order)\b/i.test(text) ||
    /\b(add|put|include)\b\s+(?:\d+\s+(?:units?\s+of\s+)?)?(?:this|that|the\s+)?(?:product|item|sku)\b/i.test(text) ||
    /\b(add|put|include)\b\s+\d+\s+(?:units?\s+of\s+)?[A-Z][A-Z0-9-]*\b/i.test(text)
  );
}
function wantsProducts(text: string) {
  return /\b(find|search|recommend|suggest|show|product|socket|breaker|mcb|cable|conduit|panel|light|distribution|junction|sku|datasheet)\b/i.test(
    text,
  );
}

export async function POST(request: Request) {
  try {
    const limited = process.env.NODE_ENV === "development" ? null : rateLimit(request, "ai-chat", 30, 60_000);
    if (limited) return limited;
    const includeEvalTelemetry = request.headers.get("x-rag-eval") === "1" && process.env.NODE_ENV !== "production";
    const evalRetrievalMode = includeEvalTelemetry ? request.headers.get("x-rag-retrieval-mode") : null;
    const evalReranker = includeEvalTelemetry ? request.headers.get("x-rag-reranker") : null;
    const evalRewriteMode = includeEvalTelemetry ? request.headers.get("x-rag-rewrite") : null;
    // Before/after benchmarking: force the decision router on/off per request
    // without restarting the server. Same gating as the other eval headers.
    const evalDecision = includeEvalTelemetry ? request.headers.get("x-rag-decision") : null;
    const requestStarted = Date.now();
    const {
      message,
      history = [],
      customer = {},
    } = (await request.json()) as {
      message?: string;
      history?: ChatTurn[];
      customer?: CustomerFields;
    };
    const question = message?.trim().slice(0, 1200);
    if (!question)
      return Response.json(
        { error: "Type a question for SupplyAI." },
        { status: 400 },
      );
    const session = await sessionFor(request);
    await supabase("chat_messages", {
      method: "POST",
      body: JSON.stringify({
        session_id: session.id,
        role: "user",
        content: question,
      }),
    });
    await supabase(`chat_sessions?id=eq.${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    });
    const action: Action | null =
      /\b(track|status|where is|follow.?up)\b/i.test(question)
        ? "TRACK_RFQ"
        : /\b(rfq|quote|quotation|request quote|add to rfq|send request)\b/i.test(
              question,
            )
          ? "CREATE_RFQ"
          : null;
    const products = await listActiveProducts();
    // Experiment groups (Phase 4): A = legacy RAG (control), B = legacy +
    // deterministic multi-query (no Jev), C = selective Jev (complex only),
    // D = Jev routing for all queries. The x-rag-decision eval header selects
    // the group per request; otherwise env decides. Default is A.
    // SF-JEV: when the group is legacy, every line below behaves exactly as
    // before (legacy rewrite + retrieval).
    const evalDecisionValue = (evalDecision || "").toLowerCase();
    const decisionGroup: "A" | "B" | "C" | "D" =
      evalDecisionValue === "off" ? "A"
      : evalDecisionValue === "multi" ? "B"
      : evalDecisionValue === "selective" ? "C"
      : evalDecisionValue === "on" ? "D"
      : String(process.env.DECISION_ROUTER_ENABLED || "false").toLowerCase() !== "true" ? "A"
      : String(process.env.DECISION_PROVIDER || "jev").toLowerCase() === "heuristic" ? "B"
      : String(process.env.DECISION_SELECTIVE || "false").toLowerCase() === "true" ? "C"
      : "D";
    const decisionEnabled = decisionGroup !== "A";
    const diagnostics = decisionEnabled ? createDiagnostics({ provider: "jev" }) : null;
    // Decision-router modules are untyped .mjs; the SF-JEV interfaces above
    // keep this boundary strictly typed.
    let routing: DecisionRouting | null = null;
    let retrievalPlan: RetrievalPlanShape | null = null;
    let routerEvidence: EvidenceShape | null = null;
    let routingMs = 0;
    if (decisionEnabled) {
      const routingStarted = Date.now();
      try {
        const baseConfig = getDecisionConfig();
        const effectiveConfig = {
          ...baseConfig,
          enabled: true,
          // Group B plans deterministically without any Jev API call.
          provider: decisionGroup === "B" ? "heuristic" : "jev",
          // Group C calls Jev only for complex-query candidates.
          selective: decisionGroup === "C",
        };
        routing = await routeQuery({ query: question, history, products }, { config: effectiveConfig });
      } catch {
        routing = null;
      }
      routingMs = Date.now() - routingStarted;
    }
    // Retrieval strategy: "legacy" is the original single-query path. Only an
    // explicit multi decision uses the planner -- a Jev failure falls back to
    // legacy, never to heuristic-multi.
    const retrievalStrategy = routing?.strategy === "multi" ? "multi" : "legacy";
    const relevantHistory = Array.isArray(history)
      ? history
          .filter(
            (turn) => turn?.role === "user" && typeof turn.content === "string",
          )
          .slice(-3)
          .map((turn) => turn.content)
          .join(" ")
      : "";
    const inferredCustomer = mergeCustomerDetails(
      customer,
      `${relevantHistory} ${question}`,
    );
    const rewriteMode = (evalRewriteMode || process.env.QUERY_REWRITE_MODE || "history").toLowerCase();
    let retrievalQuestion: string;
    let rewriteMs = 0;
    if (retrievalStrategy === "multi" && routing?.normalized) {
      // Router decides WHETHER rewriting is needed; existing logic does it.
      const resolved = resolveRetrievalQuery(question, history, routing.normalized, rewriteMode);
      retrievalQuestion = resolved.retrievalQuestion;
    } else if (rewriteMode === "history") {
      retrievalQuestion = rewriteQuery(question, relevantHistory);
    } else if (rewriteMode === "none") {
      retrievalQuestion = question;
    } else {
      retrievalQuestion = `${relevantHistory}\n${question}`.trim();
    }
    if (rewriteMode === "hyde") {
      const rewriteStarted = Date.now();
      try {
        const hypothetical = await hypotheticalQuery(retrievalQuestion);
        retrievalQuestion = `${retrievalQuestion}\n${hypothetical}`.trim();
      } catch {
        /* HyDE is optional; the original query remains safe when it is unavailable. */
      }
      rewriteMs = Date.now() - rewriteStarted;
    }
    const queries = decomposeQuery(retrievalQuestion);
    if (retrievalStrategy === "multi" && routing?.normalized) {
      retrievalPlan = buildRetrievalPlan(routing.normalized, {
        query: question,
        retrievalQuestion,
        productIds: routing.skus?.productIds || [],
        unknownSkus: routing.skus?.unknown || [],
      });
    }
    const legacyMatches = fuseByKeywords(products, queries, productText).slice(0, 3);
    // Exact SKU matches from the router are deterministic; union them with
    // the legacy fuzzy ranking (dedupe by product id, exact first).
    // Unknown-SKU guard: when the question names a full-length identifier
    // that matches nothing in the catalogue, fuzzy matches are dropped so a
    // similar product is never presented as the requested one. Short family
    // codes (PF7, S200) keep fuzzy matching.
    const matches = (() => {
      const unknown = routing?.skus?.unknown || [];
      const validated = routing?.skus?.matched || [];
      if (
        retrievalStrategy === "multi" &&
        unknown.some((sku) => String(sku).length >= 5) &&
        validated.length === 0
      ) {
        return [];
      }
      if (!validated.length) return legacyMatches;
      const seen = new Set<string>();
      const out: typeof legacyMatches = [];
      for (const m of validated) {
        const product = m?.product;
        if (product && !seen.has(product.id)) {
          seen.add(product.id);
          out.push(product);
        }
      }
      for (const product of legacyMatches) {
        if (!seen.has(product.id)) {
          seen.add(product.id);
          out.push(product);
        }
      }
      return out.slice(0, 3);
    })();
    const top = matches[0];
    const quantity = requestedQuantity(question);
    const cartAction: CartAction =
      wantsCart(question) &&
      quantity &&
      top &&
      (matches.length === 1 ||
        question.toLowerCase().includes(top.sku.toLowerCase()))
        ? { productId: top.id, quantity }
        : null;
    const includeMatches = Boolean(cartAction || wantsProducts(question));
    const productFacts = formatProductFacts(matches);
    const fallback =
      action === "TRACK_RFQ"
        ? "I have opened RFQ tracking. Enter the RFQ reference and email address used for the request to see its current status."
        : wantsCart(question) && top && !quantity
          ? `I found **${top.name}**. How many units would you like to add?`
          : action === "CREATE_RFQ"
            ? "I can build your RFQ here. Tell me the product type, quantity, rating, and installation environment; then complete the buyer details on the right before sending."
            : wantsCart(question) && matches.length
              ? "I found more than one possible product. Please tell me the exact product name, SKU, or rating and I will add the right one."
              : matches.length
                ? `I found ${matches.length} relevant product${matches.length === 1 ? "" : "s"}. Check the options below and add suitable items to your RFQ. Our team confirms final stock, lead time and project pricing.`
                : "I could not find an exact catalogue match. Tell me the product type, quantity, rating and installation environment, or submit an RFQ and our team will review it.";
    const publicMatches = includeMatches
      ? matches.map((product) => ({
          ...product,
          imageUrl: product.image_url || null,
        }))
      : [];
    if (!process.env.DEEPSEEK_API_KEY) {
      await supabase("chat_messages", {
        method: "POST",
        body: JSON.stringify({
          session_id: session.id,
          role: "assistant",
          content: fallback,
        }),
      });
      const headers = new Headers({ "Content-Type": "application/json" });
      if (session.created)
        setChatCookies(headers, session.id, session.ownerToken);
      return new Response(
        JSON.stringify({
          answer: cartAction
            ? `Added **${cartAction.quantity} × ${matches[0].name}** to your RFQ cart. Please complete your contact details on the right before sending.`
            : fallback,
          matches: publicMatches,
          action,
          cartAction,
          customer: inferredCustomer,
        }),
        { headers },
      );
    }
    const safeHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .filter(
            (turn) =>
              turn &&
              (turn.role === "user" || turn.role === "assistant") &&
              typeof turn.content === "string",
          )
          .map((turn) => ({
            role: turn.role,
            content: turn.content.slice(0, 700),
          }))
      : [];
    let knowledge = "";
    let sources: KnowledgeSource[] = [];
    let retrievalResult: RetrievalResult | null = null;
    const retrievalStarted = Date.now();
    try {
      const configuredKnowledgeLimit = Number(process.env.RETRIEVAL_TOP_K) || 5;
      // Aggregations need room for all matching product chunks; unrelated reference chunks can occupy the first slots.
      const knowledgeLimit = /\b(list|all|each|every)\b/i.test(question)
        ? Math.max(configuredKnowledgeLimit, 10)
        : configuredKnowledgeLimit;
      if (retrievalStrategy === "multi" && retrievalPlan && routerEvidence === null) {
        if (!retrievalPlan.requiresRetrieval) {
          // General conversation: skip retrieval entirely.
          retrievalResult = {
            mode: "router-skipped",
            chunks: [],
          };
        } else {
          const configuredMode = (
            evalRetrievalMode ||
            process.env.RETRIEVAL_MODE ||
            "keyword"
          ).toLowerCase();
          const { settled } = await executePlan(retrievalPlan, {
            supabase,
            products,
            configuredMode,
            limit: knowledgeLimit,
          });
          routerEvidence = aggregateEvidence(retrievalPlan, settled, {
            question: retrievalQuestion,
            queries,
            globalTopK: getDecisionConfig().evidenceTopK || knowledgeLimit,
          });
          const chunks: RetrievedChunk[] = routerEvidence.documents;
          retrievalResult = {
            mode: `router:${retrievalPlan.operations.map((op: RetrievalOperationShape) => op.type).join("+")}`,
            requestedMode: configuredMode,
            chunks,
          };
          knowledge = formatKnowledge(chunks);
          sources = [
            ...new Map<string, KnowledgeSource>(
              chunks.map((chunk: RetrievedChunk) => [
                `${chunk.source_type}:${chunk.title}`,
                { title: chunk.title, sourceType: chunk.source_type },
              ]),
            ).values(),
          ];
        }
      } else {
        const retrieved = await retrieveKnowledge({
          supabase,
          question: retrievalQuestion,
          queries,
          limit: knowledgeLimit,
          mode: evalRetrievalMode || undefined,
          reranker: evalReranker || undefined,
        });
        retrievalResult = retrieved;
        knowledge = formatKnowledge(retrieved.chunks);
        sources = [
          ...new Map<string, KnowledgeSource>(
            retrieved.chunks.map((chunk: RetrievedChunk) => [
              `${chunk.source_type}:${chunk.title}`,
              { title: chunk.title, sourceType: chunk.source_type },
            ]),
          ).values(),
        ];
      }
    } catch {
      /* Knowledge base is optional for public chat. */
    }
    const retrievalMs = Date.now() - retrievalStarted;
    // Tell DeepSeek which required information could not be retrieved so it
    // can abstain on that part instead of fabricating it.
    const missingNote =
      routerEvidence?.missingInformation?.length
        ? `\n\nRETRIEVAL GAPS (do not fabricate these; say they are unavailable): ${routerEvidence.missingInformation.join(", ")}.`
        : "";
    const decisionDiagnostics = diagnostics
      ? {
          query_id: diagnostics.query_id,
          decision_provider: "jev",
          decision_group: decisionGroup,
          retrieval_strategy: retrievalStrategy,
          decision_source: routing?.source || "unavailable",
          jev_attempted: Boolean(routing?.jevAttempted),
          complexity: (routing as { complexity?: { complex: boolean; reasons: string[] } } | null)?.complexity || null,
          detected_intents: routing?.normalized?.detectedIntents || [],
          retrieval_operations: retrievalPlan?.operations?.map((op: RetrievalOperationShape) => op.type) || [],
          routing_latency_ms: routingMs,
          retrieval_latency_ms: retrievalMs,
          generation_latency_ms: null as number | null,
          fallback_used: Boolean(!routing || routing.fallbackUsed),
          fallback_reason: routing?.fallbackReason || (routing ? null : "router-error"),
          failed_operations: routerEvidence?.failedOperations || [],
          missing_information: routerEvidence?.missingInformation || [],
        }
      : null;
    const profile = `Name: ${inferredCustomer.name || "missing"}; Company: ${inferredCustomer.company || "missing"}; Email: ${inferredCustomer.email || "missing"}; Notes: ${inferredCustomer.note || "none"}.`;
    const system = `You are SupplyAI, a friendly customer support assistant for SupplierFlow, 
    an electrical B2B supplier catalogue. Speak naturally, briefly and helpfully. 
    Answer in the language used by the customer; use English when the question is in English.
    Use short paragraphs and simple Markdown lists where useful. You help customers find products, 
    understand listed specifications, explain the RFQ process, and prepare a clear request. 
    The app can add a product to the RFQ cart when the buyer asks. Do not say you cannot add items; 
    if an item is unambiguous, confirm it was added. 
    For an RFQ, ask for every missing buyer detail (name, company, work email, optional project note) in one compact prompt, 
    never one field at a time. For multiple confirmed items,
     write each item as \`Item: product name (SKU)\` followed by \`Quantity: N units\` so the RFQ cart can fill them.
      Only use catalogue facts provided below. 
      If a specific value the buyer asked for is not present in the facts below, say plainly that you do not have it and 
      offer to have the sales team confirm; never estimate, infer from a similar product,
       or supply a figure from general knowledge. A figure stated for one product or category does not apply to another. 
      For comparison questions, write every requested value explicitly next to its SKU.
      For SKU or article-number boundary questions, repeat the exact requested identifier next to the facts it identifies.
      For “list all” questions, include every catalogue item that satisfies the constraints.
      For aggregation questions, inspect SUPPORT KNOWLEDGE as a checklist: treat every distinct SKU or product heading as a separate candidate, filter all candidates against every constraint, and write one bullet per matching SKU with every requested field. Never answer with only an example or stop after the first two matches.
      Do not rely on table column position.
      Answer every part of the user's question. Before sending, check that every requested value, unit, product, and condition appears in the answer. Do not stop after answering the first fact.
      For a single-curve reference question, answer only the named curve's range; do not add other curve ranges unless the user asks for a comparison.
      For temperature or derating questions, explicitly state the manufacturer and its reference temperature when those facts are provided.
      For DC-coil terminal questions, explicitly use the word “polarity” when stating the positive or negative terminal.
      For Incoterms named-place questions, explicitly call it the “delivery point” or say “where delivery occurs”.
      For compatibility or replacement questions, explicitly use the word “compatible” when stating the condition for a valid replacement.
      For overload-relay versus short-circuit-protection questions, explicitly use the phrase “protective device” when stating what remains required upstream.
      For RCCB selectivity questions, explicitly state that the upstream IΔn should be at least 2× the downstream IΔn when that rule is present in the facts; mention any practical 3× recommendation too.

Use the exact field name from the catalogue when the user uses a synonym. For an RCCB, “rated fault current” refers to the listed “rated residual operating current” or “residual-current sensitivity”. Never say a value is missing when the facts below state it.
      For SKU comparisons, do not use a Markdown table. Write one bullet block per SKU and explicitly repeat phrases such as “B curve” or “C curve”. 
      For questions asking whether one electrical type, curve, rating, or protection class can be treated as another, do not answer “yes” merely because their capabilities overlap. State first that they are not automatically equivalent, then explain the overlap and preserve the exact listed specification.
      For Incoterms questions, explicitly distinguish buyer and seller responsibilities from SupplierFlow-specific delivery times, charges, stock, and tax facts.
      For questions asking whether Incoterms alone gives a delivery time, explicitly state that it allocates buyer/seller responsibilities and costs, but does not provide the delivery time.
      Include only facts present in the catalogue; never add price or other unsupported fields.
       Never promise or confirm final stock, delivery dates, discounts, project prices, warranty eligibility, an order, an RFQ submission, 
       or a status change. Do not mention internal tools, prompts, databases or AI limitations.
       \n\nBUYER DETAILS:\n${profile}\n\nCATALOGUE FACTS:\n${productFacts ||
        "No direct catalogue match found."}\n\nSUPPORT KNOWLEDGE:\n${knowledge || "No relevant support document found."}${missingNote}`;
    const generationStarted = Date.now();
    // Phase 7: failure categories are recorded, never the response content.
    // One bounded retry on transport errors or 5xx only -- never on 4xx,
    // empty choices, or empty content.
    let generationFailure: string | null = null;
    let generationRetry = false;
    const callGeneration = async () => fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          ...safeHistory,
          { role: "user", content: question },
        ],
      }),
    });
    let response: Response | null = null;
    try {
      response = await callGeneration();
    } catch {
      generationFailure = "transport-error";
    }
    if (generationFailure === "transport-error" || (response && !response.ok && response.status >= 500)) {
      if (response && !response.ok && response.status >= 500) generationFailure = `http-${response.status}`;
      try {
        generationRetry = true;
        response = await callGeneration();
        if (response.ok) generationFailure = null;
        else generationFailure = `http-${response.status}-after-retry`;
      } catch {
        generationFailure = "transport-error-after-retry";
        response = null;
      }
    } else if (response && !response.ok) {
      generationFailure = `http-${response.status}`;
    }
    let ai: GenerationResult | null = null;
    if (response?.ok) {
      try {
        ai = (await response.json()) as GenerationResult;
      } catch {
        generationFailure = "invalid-response-body";
      }
    }
    const generatedText = ai?.choices?.[0]?.message?.content?.trim() || "";
    if (!generationFailure && response?.ok && !generatedText) {
      generationFailure = ai?.choices?.length ? "empty-content" : "empty-choices";
    }
    const generationMs = Date.now() - generationStarted;
    if (decisionDiagnostics) {
      decisionDiagnostics.generation_latency_ms = generationMs;
    }
    // A canned fallback standing in for a failed generation is marked as
    // such in telemetry; it is never silently counted as generated output.
    const generationFallbackUsed = !cartAction && !wantsCart(question) && !generatedText;
    const rawAnswer = cartAction
      ? `Added **${cartAction.quantity} × ${top!.name}** to your RFQ cart. Complete your contact details on the right when you are ready to send it.`
      : wantsCart(question)
        ? fallback
        : generatedText || fallback;
    const answer = citeSources(rawAnswer, sources);
    const completedCustomer = mergeCustomerDetails(inferredCustomer, rawAnswer);
    const cartActions = cartAction
      ? [cartAction]
      : cartActionsFromSummary(products, rawAnswer);
    const ragEval = includeEvalTelemetry
      ? {
          requestedMode: retrievalResult?.requestedMode || process.env.RETRIEVAL_MODE || "keyword",
          mode: retrievalResult?.mode || null,
          rewriteMode,
          retrievalQuestion,
          rewriteMs,
          rerankMode: retrievalResult?.rerankMode || null,
          candidateCount: retrievalResult?.candidateCount || retrievalResult?.chunks?.length || 0,
          representation: retrievalResult?.representation || "chunk",
          gated: Boolean(retrievalResult?.gated),
          degradedReason: retrievalResult?.degradedReason || null,
          retrievalMs,
          generationMs,
          totalMs: Date.now() - requestStarted,
          retrievedChunks: (retrievalResult?.chunks || []).map((chunk) => ({
            content: chunk.content,
            title: chunk.title,
            sourceType: chunk.source_type,
            similarity: chunk.similarity,
          })),
          catalogueFacts: productFacts,
          supportKnowledge: knowledge,
          model: ai?.model || "deepseek-v4-flash",
          usage: ai?.usage || null,
          generationFailure,
          generationRetry,
          generationFallbackUsed,
          decision: decisionDiagnostics
            ? {
                ...decisionDiagnostics,
                total_latency_ms: Date.now() - requestStarted,
                retrieval_plan: retrievalPlan
                  ? {
                      requiresRetrieval: retrievalPlan.requiresRetrieval,
                      operations: retrievalPlan.operations,
                      requiresQueryRewrite: retrievalPlan.requiresQueryRewrite,
                    }
                  : null,
                confidences: routing?.normalized?.confidences || null,
                usage: routing?.usage || null,
              }
            : undefined,
        }
      : undefined;
    await supabase("chat_messages", {
      method: "POST",
      body: JSON.stringify({
        session_id: session.id,
        role: "assistant",
        content: answer,
      }),
    });
    const headers = new Headers({ "Content-Type": "application/json" });
    if (session.created)
      setChatCookies(headers, session.id, session.ownerToken);
    return new Response(
      JSON.stringify({
        answer,
        sources,
        matches: publicMatches,
        action,
        cartAction: cartActions[0] || null,
        cartActions,
        customer: completedCustomer,
        ragEval,
        decision: decisionDiagnostics
          ? {
              detected_intents: decisionDiagnostics.detected_intents,
              retrieval_operations: decisionDiagnostics.retrieval_operations,
              routing_latency_ms: decisionDiagnostics.routing_latency_ms,
              retrieval_latency_ms: decisionDiagnostics.retrieval_latency_ms,
              generation_latency_ms: decisionDiagnostics.generation_latency_ms,
              total_latency_ms: Date.now() - requestStarted,
              fallback_used: decisionDiagnostics.fallback_used,
              fallback_reason: decisionDiagnostics.fallback_reason,
            }
          : undefined,
      }),
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
