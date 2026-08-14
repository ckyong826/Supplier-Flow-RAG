type RfqItem = {
  productId?: string;
  productName?: string;
  sku?: string;
  quantity?: number;
};

type RfqPayload = {
  customer?: { name?: string; company?: string; email?: string; note?: string };
  items?: RfqItem[];
};
type CatalogueProduct = { id: string; name: string; sku: string };

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function reference() {
  return `RFQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function sendConfirmation(email: string, customerName: string, rfqReference: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `We received your RFQ ${rfqReference}`,
      text: `Hi ${customerName},\n\nThanks for your request. Your reference is ${rfqReference}. Our quote desk will review it and reply shortly.\n\nSupplierFlow`,
    }),
  });

  if (!response.ok) console.error("RFQ confirmation email failed", await response.text());
}

export async function POST(request: Request) {
  try {
    const error = configurationError(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (error) return json({ error }, 503);

    const payload = (await request.json()) as RfqPayload;
    const customer = payload.customer;
    const requestedItems = (payload.items ?? []).filter((item) =>
      item.productId && Number.isInteger(item.quantity) && item.quantity! > 0 && item.quantity! <= 100000,
    );

    if (!customer?.name?.trim() || !customer.company?.trim() || !customer.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
      return json({ error: "Name, company and email are required." }, 400);
    }
    if (!requestedItems.length) return json({ error: "Add at least one valid product to the RFQ." }, 400);
    const catalogueResponse = await supabase("products?is_active=eq.true&select=id,name,sku");
    const catalogue = await catalogueResponse.json() as CatalogueProduct[];
    const products = new Map(catalogue.map((product) => [product.id, product]));
    const quantities = new Map<string, number>();
    for (const item of requestedItems) quantities.set(item.productId!, (quantities.get(item.productId!) || 0) + item.quantity!);
    const items = [...quantities].map(([productId, quantity]) => ({ product: products.get(productId), quantity }));
    if (items.some((item) => !item.product)) return json({ error: "One or more RFQ products are unavailable. Refresh the catalogue and try again." }, 400);

    const rfqReference = reference();
    const rfqResponse = await supabase("rfqs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        reference: rfqReference,
        customer_name: customer.name.trim(),
        company_name: customer.company.trim(),
        email: customer.email.trim().toLowerCase(),
        requirements: customer.note?.trim() || null,
      }),
    });
    const [rfq] = (await rfqResponse.json()) as Array<{ id: string }>;

    await supabase("rfq_items", {
      method: "POST",
      body: JSON.stringify(items.map(({ product, quantity }) => ({
        rfq_id: rfq.id,
        product_id: product!.id,
        product_name: product!.name,
        sku: product!.sku,
        quantity,
      }))),
    });

    await sendConfirmation(customer.email.trim(), customer.name.trim(), rfqReference);
    return json({ reference: rfqReference, rfqId: rfq.id }, 201);
  } catch (error) {
    console.error("RFQ submission failed", error);
    return json({ error: "We could not submit the RFQ. Please try again shortly." }, 500);
  }
}
import { configurationError, supabase } from "../_supabase";
