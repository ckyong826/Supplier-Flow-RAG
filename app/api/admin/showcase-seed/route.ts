import { errorResponse, requireAdmin, supabase } from "../../_supabase";

const categories = ["Protection", "Wiring devices", "Lighting", "Cables", "Containment", "Distribution", "Accessories"];
const companies = ["Apex Engineering", "Metro Build", "Klang Electrical Works", "Prime M&E", "Northstar Construction", "Vertex Automation", "Sinar Hardware", "BluePeak Facilities", "Alliance Projects", "Urban Grid Solutions"];
const image = "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const products = Array.from({ length: 100 }, (_, index) => { const n = index + 1; const category = categories[index % categories.length]; return { id: `showcase-product-${n}`, name: `${["Industrial", "Commercial", "Weatherproof", "Professional"][index % 4]} ${category.slice(0, -1) || category} ${n}`, sku: `SF-${category.slice(0, 3).toUpperCase()}-${String(n).padStart(3, "0")}`, category, summary: `Showcase ${category.toLowerCase()} product for B2B project quotations and supplier catalogue demos.`, specifications: [`Rating: ${10 + (index % 10) * 10}A`, `Protection: IP${40 + (index % 3) * 10}`, `Application: Commercial`], availability: ["In stock", "Low stock", "Pre-order"][index % 3], image_type: "accessory", image_url: image, price: 12 + index * 4.5, is_active: true }; });
    const existingProducts = await (await supabase("products?select=sku")).json() as Array<{ sku: string }>;
    const knownSkus = new Set(existingProducts.map((row) => row.sku)); const newProducts = products.filter((product) => !knownSkus.has(product.sku));
    if (newProducts.length) await supabase("products", { method: "POST", body: JSON.stringify(newProducts) });

    const existingRfqs = await (await supabase("rfqs?reference=like.SHOWCASE-RFQ-*&select=reference")).json() as Array<{ reference: string }>;
    const knownRfqs = new Set(existingRfqs.map((row) => row.reference));
    const rfqs = Array.from({ length: 100 }, (_, index) => { const n = index + 1; const status = ["NEW", "REVIEWING", "QUOTED", "WON", "LOST"][index % 5]; return { id: crypto.randomUUID(), reference: `SHOWCASE-RFQ-${String(n).padStart(4, "0")}`, customer_name: `Contact ${n}`, company_name: companies[index % companies.length], email: `procurement${n}@showcase-demo.test`, requirements: `Project requirement ${n}: ${20 + (index % 8) * 10} units required. Delivery to ${index % 2 ? "Klang Valley" : "Peninsular Malaysia"}.`, status }; }).filter((rfq) => !knownRfqs.has(rfq.reference));
    if (rfqs.length) {
      await supabase("rfqs", { method: "POST", body: JSON.stringify(rfqs) });
      const rfqItems = rfqs.flatMap((rfq, index) => [0, 1].map((offset) => { const product = products[(index * 2 + offset) % products.length]; return { rfq_id: rfq.id, product_id: product.id, product_name: product.name, sku: product.sku, quantity: 10 + ((index + offset) % 8) * 10 }; }));
      await supabase("rfq_items", { method: "POST", body: JSON.stringify(rfqItems) });
      await supabase("activity_logs", { method: "POST", body: JSON.stringify(rfqs.flatMap((rfq) => [{ rfq_id: rfq.id, message: "RFQ received from showcase dataset" }, { rfq_id: rfq.id, message: `RFQ marked ${rfq.status}` }])) });
      const quotable = rfqs.filter((rfq) => ["QUOTED", "WON", "LOST"].includes(rfq.status));
      const quotes = quotable.map((rfq, index) => ({ id: crypto.randomUUID(), rfq_id: rfq.id, reference: `SHOWCASE-Q-${String(index + 1).padStart(4, "0")}`, revision: 1, status: rfq.status === "WON" ? "ACCEPTED" : rfq.status === "LOST" ? "REJECTED" : "SENT", discount_percent: index % 4 === 0 ? 5 : 0, tax_percent: 6, delivery_fee: index % 3 === 0 ? 80 : 0, validity_days: 14, payment_terms: "30 days" }));
      if (quotes.length) { await supabase("quotations", { method: "POST", body: JSON.stringify(quotes) }); const quoteItems = quotes.flatMap((quote, index) => [0, 1].map((offset) => { const product = products[(index * 3 + offset) % products.length]; return { quotation_id: quote.id, product_id: product.id, product_name: product.name, sku: product.sku, quantity: 10 + (index % 6) * 10, unit_price: product.price, is_alternative: offset === 1 && index % 4 === 0 }; })); await supabase("quotation_items", { method: "POST", body: JSON.stringify(quoteItems) }); }
    }

    const existingKnowledge = await (await supabase("knowledge_documents?title=like.Showcase%&select=title")).json() as Array<{ title: string }>;
    if (!existingKnowledge.length) {
      const docs = Array.from({ length: 120 }, (_, index) => { const n = index + 1; const type = ["policy", "faq", "sop", "datasheet"][index % 4]; const topic = ["delivery", "warranty", "payment", "quotation", "installation", "safety", "returns", "project pricing"][index % 8]; return { id: crypto.randomUUID(), title: `Showcase ${topic} knowledge ${String(n).padStart(3, "0")}`, source_type: type, content: `Showcase ${type} document ${n}. For ${topic}, staff must verify the customer requirement, product specifications, availability, and quotation terms before sending. Klang Valley standard delivery is 1–2 working days. Peninsular Malaysia delivery is 2–4 working days. Approved account customers may receive 30-day credit terms. Warranty excludes incorrect installation and use outside stated specifications. Record follow-up outcomes in the RFQ activity log.` }; });
      await supabase("knowledge_documents", { method: "POST", body: JSON.stringify(docs) });
      await supabase("knowledge_chunks", { method: "POST", body: JSON.stringify(docs.map((document) => ({ document_id: document.id, chunk_index: 0, content: document.content }))) });
    }
    return Response.json({ added: { products: newProducts.length, rfqs: rfqs.length, quotations: rfqs.filter((rfq) => ["QUOTED", "WON", "LOST"].includes(rfq.status)).length, knowledge: existingKnowledge.length ? 0 : 120 } });
  } catch (error) { return errorResponse(error); }
}
