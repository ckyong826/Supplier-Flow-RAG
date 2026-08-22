"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPortal } from "./AdminPortal";
import { canViewPublic } from "./lib/demoTier";
import { money } from "./lib/format";
import { officialProducts } from "./lib/officialCatalogue";
import { useDemoTier } from "./lib/useDemoTier";
import { SiteFooter, SiteHeader, type PublicView } from "./components/SiteChrome";

type View = PublicView | "admin";
type AdminRole = "owner" | "admin" | "manager" | "sales" | "operations";
function normalizeAdminRole(value: unknown): AdminRole {
  return ["owner", "admin", "manager", "sales", "operations"].includes(String(value)) ? value as AdminRole : "admin";
}
type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  summary: string;
  specs: string[];
  availability: string;
  stockQuantity?: number | null;
  imageClass: string;
  imageUrl?: string | null;
  datasheetPath?: string | null;
  price: number;
};
type CartItem = { productId: string; quantity: number };
type AiSource = { title: string; sourceType: string };
type AiMessage = { role: "user" | "assistant"; content: string; matches?: Product[]; sources?: AiSource[]; track?: boolean };
type ChatSession = { id: string; title: string; createdAt: string };
function priceLabel(price: number) { return price > 0 ? `From ${money(price)}` : "Price on request"; }
function ChatText({ content }: { content: string }) {
  return <>{content.split("\n").map((line, index) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return <span className="chat-line" key={`${line}-${index}`}>{parts.map((part, partIndex) => part.startsWith("**") && part.endsWith("**") ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part)}{index < content.split("\n").length - 1 && <br />}</span>;
  })}</>;
}

type CatalogueApiProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  summary: string;
  specifications: string[];
  availability: string;
  stock_quantity?: number | null;
  image_type: string;
  image_url?: string | null;
  datasheet_path?: string | null;
  price: number;
};

function mapCatalogueProduct(product: CatalogueApiProduct): Product {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    summary: product.summary,
    specs: product.specifications,
    availability: product.stock_quantity !== null && product.stock_quantity !== undefined
      ? product.stock_quantity > 0 ? `${product.availability} · ${product.stock_quantity} available` : "Out of stock"
      : product.availability,
    imageClass: product.image_type,
    imageUrl: product.image_url,
    datasheetPath: product.datasheet_path,
    price: Number(product.price),
    stockQuantity: product.stock_quantity,
  };
}

function ProductImage({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  return (
    <div
      className={`product-image ${product.imageClass} ${compact ? "compact" : ""}`}
      style={
        product.imageUrl
          ? { backgroundImage: `url(${product.imageUrl})` }
          : undefined
      }
      role="img"
      aria-label={product.name}
    />
  );
}

export default function Home() {
  const demoTier = useDemoTier();
  const [view, setView] = useState<View>("catalog");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("SupplierFlow");
  const [products, setProducts] = useState<Product[]>(officialProducts.map(mapCatalogueProduct));
  const [catalogueReady, setCatalogueReady] = useState(false);
  const [catalogueHasMore, setCatalogueHasMore] = useState(true);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [homeChatQuestion, setHomeChatQuestion] = useState("");
  const catalogueLoadingRef = useRef(false);
  const catalogueOffsetRef = useRef(0);
  const catalogueSentinelRef = useRef<HTMLDivElement | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All products");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customer, setCustomer] = useState({
    name: "",
    company: "",
    email: "",
    note: "",
  });
  const [submittedId, setSubmittedId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  type TrackQuote = { reference: string; revision: number; status: string; discount_percent: number; tax_percent: number; delivery_fee: number; validity_days: number; payment_terms?: string; quotation_items: Array<{ product_name: string; sku: string; quantity: number; unit_price: number }> };
  const [track, setTrack] = useState<{ reference: string; email: string; status: string; error: string; loading: boolean; quotation: TrackQuote | null }>({
    reference: "",
    email: "",
    status: "",
    error: "",
    loading: false,
    quotation: null,
  });
  const [adminToken, setAdminToken] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("admin");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [toast, setToast] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { role: "assistant", content: "Hi, I am SupplyAI, your customer support assistant. Tell me what you need and I can help find products, explain listed specs, or guide your RFQ." },
  ]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [chatLoading, setChatLoading] = useState(true);
  const chatOperationRef = useRef(0);
  const [askingAi, setAskingAi] = useState(false);
  const [rfqStep, setRfqStep] = useState<"items" | "details" | "confirm">("items");

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(
      () => setToast((current) => (current === message ? "" : current)),
      2800,
    );
  }

  const loadCatalogue = useCallback(async (offset = 0, replace = false) => {
    if (catalogueLoadingRef.current) return;
    catalogueLoadingRef.current = true;
    setCatalogueLoading(true);
    if (replace) setCatalogueError("");
    try {
      const response = await fetch(`/api/catalog?limit=20&offset=${offset}`);
      if (!response.ok) throw new Error("Catalogue unavailable");
      const data = await response.json() as { products?: CatalogueApiProduct[]; hasMore?: boolean };
      const page = (data.products || []).map(mapCatalogueProduct);
      setProducts((current) => replace ? page : [...current, ...page]);
      catalogueOffsetRef.current = offset + page.length;
      setCatalogueHasMore(Boolean(data.hasMore));
      setCatalogueReady(true);
      if (replace && !page.length) setCatalogueError("No active products are available. Seed the product catalogue from Admin desk before testing RFQ.");
    } catch {
      if (replace) {
        setProducts([]);
        setCatalogueHasMore(false);
        setCatalogueReady(false);
        setCatalogueError("The catalogue could not be loaded. Check the database connection and try again.");
      }
    } finally {
      catalogueLoadingRef.current = false;
      setCatalogueLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCatalogue(0, true);
      setAdminToken(sessionStorage.getItem("supplierflow-admin-token") || "");
      setAdminRole(normalizeAdminRole(sessionStorage.getItem("supplierflow-admin-role")));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCatalogue]);
  useEffect(() => {
    if (view === "admin") return;
    void fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ settings?: { companyName?: string; logoUrl?: string | null } }> : null)
      .then((data) => {
        setCompanyName(data?.settings?.companyName || "SupplierFlow");
        setLogoUrl(data?.settings?.logoUrl || null);
      })
      .catch(() => undefined);
  }, [view]);
  useEffect(() => {
    const sentinel = catalogueSentinelRef.current;
    if (view !== "catalog" || !sentinel || !catalogueHasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadCatalogue(catalogueOffsetRef.current);
    }, { rootMargin: "320px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [catalogueHasMore, loadCatalogue, products.length, view]);
  useEffect(() => {
    if (!selectedProduct) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedProduct(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedProduct]);
  async function loadChatSessions(operation = chatOperationRef.current) {
    const response = await fetch("/api/ai-chat/session");
    const data = response.ok ? await response.json() : null;
    if (!data || operation !== chatOperationRef.current) return;
    setChatSessions(data.sessions || []);
    setActiveChatId(data.currentId || "");
  }
  async function loadChatHistory(operation = chatOperationRef.current) {
    const response = await fetch("/api/ai-chat/history");
    const data = response.ok ? await response.json() : null;
    if (operation !== chatOperationRef.current) return;
    if (data?.messages?.length) setAiMessages(data.messages);
    else setAiMessages([{ role: "assistant", content: "Hi, I am SupplyAI. What can I help you source today?" }]);
  }
  useEffect(() => {
    let mounted = true;
    const operation = chatOperationRef.current;
    const timer = window.setTimeout(() => {
      if (!mounted) return;
      setChatLoading(true);
      void Promise.all([loadChatSessions(operation), loadChatHistory(operation)]).finally(() => {
        if (mounted && operation === chatOperationRef.current) setChatLoading(false);
      });
    }, 0);
    return () => { mounted = false; window.clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!chatLoading) {
      const messages = document.querySelector<HTMLDivElement>(".customer-chat-messages");
      messages?.scrollTo({ top: messages.scrollHeight, behavior: askingAi ? "smooth" : "auto" });
    }
  }, [aiMessages.length, askingAi, chatLoading, view]);
  const categories = [
    "All products",
    ...Array.from(new Set(products.map((product) => product.category))),
  ];
  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "All products" || product.category === category) &&
          `${product.name} ${product.sku} ${product.summary}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [products, category, query],
  );
  const cartProducts = cart.flatMap((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return product ? [{ product, quantity: item.quantity }] : [];
  });
  const buyerDetailsComplete = Boolean(customer.name.trim() && customer.company.trim() && customer.email.trim());
  async function openSupplyAi(question = "") {
    const initialQuestion = question.trim();
    setHomeChatQuestion("");
    setView("ai");
    if (initialQuestion) await newChat(initialQuestion);
  }
  function add(productId: string, quantity = 1, replace = false) {
    const product = products.find((item) => item.id === productId);
    setCart((current) =>
      current.some((item) => item.productId === productId)
        ? current.map((item) =>
            item.productId === productId
              ? { ...item, quantity: replace ? quantity : item.quantity + quantity }
              : item,
          )
        : [...current, { productId, quantity }],
    );
    showToast(`${product?.name || "Product"} added to RFQ.`);
  }
  async function submitRfq(event: FormEvent) {
    event.preventDefault();
    setSubmitError("");
    if (!cartProducts.length) {
      setSubmitError("Add at least one product to your RFQ.");
      return;
    }
    setSaving(true);
    showToast("Sending your RFQ…");
    try {
      const response = await fetch("/api/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          items: cartProducts.map(({ product, quantity }) => ({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSubmittedId(data.reference);
      setTrack({
        reference: data.reference,
        email: customer.email,
        status: "NEW",
        error: "",
        loading: false,
        quotation: null,
      });
      setCart([]);
      showToast("RFQ sent successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "RFQ could not be sent.";
      setSubmitError(message);
      showToast(message);
    } finally {
      setSaving(false);
    }
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    setAdminError("");
    setLoggingIn(true);
    showToast("Signing in…");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign-in failed.");
      sessionStorage.setItem("supplierflow-admin-token", data.accessToken);
      // Kept so the portal can renew the hour-long access token without a re-login.
      if (data.refreshToken) sessionStorage.setItem("supplierflow-admin-refresh", data.refreshToken);
      const role = normalizeAdminRole(data.role);
      sessionStorage.setItem("supplierflow-admin-role", role);
      setAdminRole(role);
      setAdminToken(data.accessToken);
      setAdminPassword("");
      showToast("Signed in.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sign-in failed.";
      setAdminError(message);
      showToast(message);
    } finally {
      setLoggingIn(false);
    }
  }
  async function trackRfq(event: FormEvent) {
    event.preventDefault();
    setTrack({ ...track, loading: true, error: "", status: "", quotation: null });
    showToast("Checking RFQ status…");
    try {
      const response = await fetch(
        `/api/rfqs/status?reference=${encodeURIComponent(track.reference)}&email=${encodeURIComponent(track.email)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTrack((current) => ({
        ...current,
        status: data.rfq.status,
        quotation: data.quotation,
        loading: false,
      }));
      showToast("RFQ status updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "RFQ not found.";
      setTrack((current) => ({ ...current, error: message, loading: false }));
      showToast(message);
    }
  }
  async function respondToQuote(decision: "ACCEPTED" | "REJECTED") {
    if (!track.quotation || track.loading) return;
    setTrack((current) => ({ ...current, loading: true }));
    showToast(decision === "ACCEPTED" ? "Accepting quotation…" : "Declining quotation…");
    try {
      const response = await fetch("/api/quotations/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: track.quotation.reference, email: track.email, decision }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setTrack((current) => ({ ...current, status: decision === "ACCEPTED" ? "WON" : "LOST", loading: false, quotation: current.quotation ? { ...current.quotation, status: decision } : null }));
      showToast(decision === "ACCEPTED" ? "Quotation accepted." : "Quotation declined.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Quotation response could not be saved.");
      setTrack((current) => ({ ...current, loading: false }));
    }
  }
  async function sendChat(event: FormEvent) {
    event.preventDefault(); if (!aiQuestion.trim() || askingAi) return;
    const question = aiQuestion.trim(); const history = aiMessages.map(({ role, content }) => ({ role, content }));
    setAiQuestion(""); setAiMessages((current) => [...current, { role: "user", content: question }]); setAskingAi(true);
    try { const response = await fetch("/api/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, history, customer }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const nextCustomer = { ...customer, ...data.customer }; if (data.customer) setCustomer(nextCustomer); const cartActions = data.cartActions || (data.cartAction ? [data.cartAction] : []); for (const cartAction of cartActions) add(cartAction.productId, cartAction.quantity, true); setAiMessages((current) => [...current, { role: "assistant", content: data.answer, matches: data.matches || [], sources: data.sources || [], track: data.action === "TRACK_RFQ" }, ...(cartActions.length && !(nextCustomer.name.trim() && nextCustomer.company.trim() && nextCustomer.email.trim()) ? [{ role: "assistant" as const, content: "To complete your RFQ, reply once with your full name, company name, and work email. You can add an optional project note too." }] : [])]); void loadChatSessions(); if (data.action === "TRACK_RFQ") { const reference = question.match(/\bRFQ-\d{4}-[A-Z0-9-]+\b/i)?.[0] || ""; setTrack((current) => ({ ...current, reference: reference || current.reference, email: data.customer?.email || current.email || customer.email, error: "", quotation: null })); } } catch (error) { const message = error instanceof Error ? error.message : "SupplyAI could not answer."; setAiMessages((current) => [...current, { role: "assistant", content: "Sorry, I could not check that right now. Please try again or submit an RFQ for the supplier team." }]); showToast(message); } finally { setAskingAi(false); }
  }
  async function newChat(initialQuestion = "") {
    const operation = ++chatOperationRef.current;
    setChatLoading(true);
    setAiQuestion(initialQuestion);
    try {
      const response = await fetch("/api/ai-chat/session", { method: "POST" });
      const data = response.ok ? await response.json() : null;
      if (!data) return showToast("A new chat could not be started.");
      setActiveChatId(data.id);
      setChatSessions((current) => [{ id: data.id, title: "New conversation", createdAt: new Date().toISOString() }, ...current]);
      setAiMessages([{ role: "assistant", content: "Hi, I am SupplyAI. What can I help you source today?" }]);
      showToast("New chat started.");
    } finally {
      if (operation === chatOperationRef.current) setChatLoading(false);
    }
  }
  async function selectChat(id: string) {
    if (id === activeChatId || chatLoading) return;
    const operation = ++chatOperationRef.current;
    setChatLoading(true);
    try {
      const response = await fetch("/api/ai-chat/session", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error("Conversation could not be opened.");
      setActiveChatId(id);
      await loadChatHistory(operation);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Conversation could not be opened.");
    } finally {
      if (operation === chatOperationRef.current) setChatLoading(false);
    }
  }
  async function clearChat() {
    const operation = ++chatOperationRef.current;
    setChatLoading(true);
    try {
      const response = await fetch("/api/ai-chat/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Chat could not be cleared.");
      setAiMessages([{ role: "assistant", content: "Chat cleared. What can I help you with?" }]);
      setChatSessions((current) => current.map((session) => session.id === activeChatId ? { ...session, title: "New conversation" } : session));
      setAiQuestion("");
      showToast("Chat cleared.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Chat could not be cleared.");
    } finally {
      if (operation === chatOperationRef.current) setChatLoading(false);
    }
  }
  function updateChatCart(productId: string, quantity: number) {
    setCart((current) => current.map((item) => item.productId === productId ? { ...item, quantity: Math.max(1, quantity || 1) } : item));
  }
  function removeChatCart(productId: string) {
    setCart((current) => current.filter((item) => item.productId !== productId));
  }
  async function submitChatRfq() {
    if (!cartProducts.length) return showToast("Add a product before sending your RFQ.");
    setSaving(true); showToast("Sending your RFQ...");
    try {
      const response = await fetch("/api/rfqs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer, items: cartProducts.map(({ product, quantity }) => ({ productId: product.id, productName: product.name, sku: product.sku, quantity })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSubmittedId(data.reference); setTrack({ reference: data.reference, email: customer.email, status: "NEW", error: "", loading: false, quotation: null }); setCart([]); setRfqStep("items");
      setAiMessages((current) => [...current, { role: "assistant", content: `Your RFQ **${data.reference}** has been submitted. I have sent it to the quote desk. You can return anytime and track it using the same email address.` }]);
      showToast("RFQ sent successfully.");
    } catch (error) { showToast(error instanceof Error ? error.message : "RFQ could not be sent."); } finally { setSaving(false); }
  }
  return (
    <main className="app-shell">
      {toast && (
        <div className="app-toast" role="status">
          {toast}
        </div>
      )}
      {view !== "admin" && (
        <SiteHeader
          view={view}
          cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
          demoTier={demoTier}
          logoUrl={logoUrl}
          companyName={companyName}
          onView={(nextView) => { if (canViewPublic(demoTier, nextView)) setView(nextView); }}
          onAdmin={() => setView("admin")}
        />
      )}
      {view === "catalog" && (
        <section>
          <div className="page-intro">
            <div>
              <p className="kicker">SupplierFlow / Product catalogue</p>
              <h1>
                Source with <em>confidence.</em>
              </h1>
              <p className="intro-copy">
                Trade-ready electrical supplies, clear specifications and a
                structured way to request the right quote.
              </p>
            </div>
            <figure className="catalog-photo">
              <img
                src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=85"
                alt="Organised industrial warehouse shelving"
              />
              <figcaption>READY FOR PROJECT DEMAND</figcaption>
            </figure>
            <div className="intro-stat">
              <strong>{products.length}+</strong>
              <span>Products in catalogue</span>
            </div>
          </div>
          <div className="catalog-toolbar">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products or SKU"
              />
            </label>
            <div className="category-tabs">
              {categories.map((item) => (
                <button
                  key={item}
                  className={category === item ? "selected" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <form
            className="home-chat-box"
            onSubmit={(event) => {
              event.preventDefault();
              openSupplyAi(homeChatQuestion.trim());
            }}
          >
            <div>
              <p className="kicker">Need help choosing?</p>
              <h2>Ask SupplyAI about a product or quote.</h2>
            </div>
            <div className="home-chat-form">
              <input
                value={homeChatQuestion}
                onChange={(event) => setHomeChatQuestion(event.target.value)}
                placeholder="Try: Find an outdoor waterproof socket"
                aria-label="Ask SupplyAI"
              />
              <button type="submit" className="primary-button">Open SupplyAI</button>
            </div>
          </form>
          <div className="catalog-grid">
            {catalogueError ? (
              <div className="catalog-empty" role="alert">
                <strong>Catalogue unavailable.</strong>
                <p>{catalogueError}</p>
              </div>
            ) : visible.length ? visible.map((product) => (
              <article className="product-card" key={product.id}>
                <button
                  className="product-preview"
                  type="button"
                  aria-label={`View details for ${product.name}`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <ProductImage product={product} />
                </button>
                <div className="product-info">
                  <div className="product-heading">
                    <div>
                      <p className="sku">{product.sku}</p>
                      <h2>{product.name}</h2>
                    </div>
                    <span
                      className={`availability ${product.availability.toLowerCase().replace(" ", "-")}`}
                    >
                      {product.availability}
                    </span>
                  </div>
                  <p className="product-summary">{product.summary}</p>
                  <p className="catalogue-price">{priceLabel(product.price)}</p>
                  <div className="spec-row">
                    {product.specs.map((spec) => (
                      <span key={spec}>{spec}</span>
                    ))}
                  </div>
                  <div className="product-footer">
                    <button
                      className="text-button"
                      type="button"
                      aria-label={`View details for ${product.name}`}
                      onClick={() => setSelectedProduct(product)}
                    >
                      Details
                    </button>
                    <button
                      className="outline-button"
                      disabled={!catalogueReady}
                      onClick={() => add(product.id)}
                    >
                      Add to RFQ
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="catalog-empty" role="status">
                <strong>No products match your search.</strong>
                <p>Try a different keyword or clear the current filters.</p>
                <button type="button" className="outline-button" onClick={() => { setQuery(""); setCategory("All products"); }}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div ref={catalogueSentinelRef} className="catalogue-sentinel" aria-live="polite">
            {catalogueLoading && <span>Loading more products...</span>}
          </div>
        </section>
      )}
      {selectedProduct && (
        <div className="modal-backdrop" role="presentation">
          <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <button
              type="button"
              className="modal-close"
              aria-label="Close product details"
              onClick={() => setSelectedProduct(null)}
            >
              ×
            </button>
            <ProductImage product={selectedProduct} />
            <div>
              <p className="sku">{selectedProduct.sku}</p>
                      <h2 id="product-modal-title">{selectedProduct.name}</h2>
                      <p>{selectedProduct.summary}</p>
                      <p className="catalogue-price">{priceLabel(selectedProduct.price)}</p>
              <dl>
                {selectedProduct.specs.map((spec) => (
                  <div key={spec}>
                    <dt>Specification</dt>
                    <dd>{spec}</dd>
                  </div>
                ))}
              </dl>
              <div className="modal-actions">
                {selectedProduct.datasheetPath && (
                  <a
                    className="outline-button"
                    href={selectedProduct.datasheetPath}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Datasheet
                  </a>
                )}
                <button
                  className="primary-button"
                  disabled={!catalogueReady}
                  onClick={() => {
                    add(selectedProduct.id);
                    setSelectedProduct(null);
                  }}
                >
                  Add to RFQ
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {view === "rfq" && (
        <section>
          <div className="page-title-row">
            <div>
              <p className="kicker">Structured quote request</p>
              <h1>
                Build your <em>RFQ.</em>
              </h1>
              <p>
                Tell our team what your project needs. No checkout, no account
                required.
              </p>
            </div>
          </div>
          {submittedId ? (
            <div className="success-panel">
              <span className="success-icon">✓</span>
              <p className="kicker">Request received</p>
              <h2>We’re on it.</h2>
              <p>
                Your RFQ reference is <strong>{submittedId}</strong>. A
                confirmation email is on its way.
              </p>
              <div className="modal-actions">
                <button
                  className="primary-button"
                  onClick={() => setView("track")}
                >
                  Track RFQ
                </button>
                <button
                  className="outline-button"
                  onClick={() => setView("catalog")}
                >
                  Back to catalogue
                </button>
              </div>
            </div>
          ) : (
            <div className="rfq-layout">
              <div className="rfq-items-panel">
                <div className="panel-heading">
                  <h2>Items to quote</h2>
                  <span>{cartProducts.length} products</span>
                </div>
                {cartProducts.length ? (
                  cartProducts.map(({ product, quantity }) => (
                    <div className="rfq-line" key={product.id}>
                      <ProductImage product={product} compact />
                      <div className="rfq-line-name">
                        <strong>{product.name}</strong>
                        <span>{product.sku}</span>
                        <small>{money(product.price)} each · {money(product.price * quantity)}</small>
                      </div>
                      <label>
                        Qty
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) =>
                            setCart(
                              cart.map((item) =>
                                item.productId === product.id
                                  ? {
                                      ...item,
                                      quantity: Math.max(
                                        1,
                                        Number(e.target.value),
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="remove-button"
                        onClick={() =>
                          setCart(
                            cart.filter(
                              (item) => item.productId !== product.id,
                            ),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-rfq">
                    <strong>Your RFQ is empty.</strong>
                    <button
                      className="outline-button"
                      onClick={() => setView("catalog")}
                    >
                      Browse catalogue
                    </button>
                  </div>
                )}
                {cartProducts.length > 0 && <div className="rfq-estimate"><span>Estimated catalogue total</span><strong>{cartProducts.some((item) => item.product.price <= 0) ? "Price on request" : money(cartProducts.reduce((sum, item) => sum + item.product.price * item.quantity, 0))}</strong><small>Final pricing and availability are confirmed in your quotation.</small></div>}
              </div>
              <form className="request-form" onSubmit={submitRfq}>
                <div className="panel-heading">
                  <h2>Your details</h2>
                  <span>Required fields marked *</span>
                </div>
                <label>
                  Full name *
                  <input
                    required
                    value={customer.name}
                    onChange={(e) =>
                      setCustomer({ ...customer, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Company *
                  <input
                    required
                    value={customer.company}
                    onChange={(e) =>
                      setCustomer({ ...customer, company: e.target.value })
                    }
                  />
                </label>
                <label>
                  Work email *
                  <input
                    required
                    type="email"
                    value={customer.email}
                    onChange={(e) =>
                      setCustomer({ ...customer, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  Project requirements
                  <textarea
                    rows={5}
                    value={customer.note}
                    onChange={(e) =>
                      setCustomer({ ...customer, note: e.target.value })
                    }
                  />
                </label>
                {submitError && <p className="form-error">{submitError}</p>}
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Sending RFQ…" : "Send RFQ"}
                </button>
              </form>
            </div>
          )}
        </section>
      )}
      {view === "ai" && canViewPublic(demoTier, "ai") && (
        <section className="public-ai-page">
          {chatLoading && <div className="chat-loading-overlay" role="status" aria-label="Loading conversation"><div className="chat-loading-card"><span /><span /><span /></div></div>}
          <div className="public-ai-heading"><div><p className="kicker">SupplyAI / customer support</p><h1>Source smarter. <em>Request faster.</em></h1><p>Ask naturally. SupplyAI finds products, builds your RFQ and helps you track it afterwards.</p></div><div className="ai-capabilities"><span>Product matching</span><span>RFQ assistant</span><span>Status tracking</span></div></div>
          <aside className="chat-session-sidebar"><button className="new-chat-button" onClick={() => void newChat()}>＋ New chat</button><div className="chat-session-label">Conversations</div>{chatSessions.length ? chatSessions.map((session) => <button className={`current-chat ${session.id === activeChatId ? "active" : ""}`} key={session.id} onClick={() => void selectChat(session.id)}><span>{session.id === activeChatId ? "●" : "○"}</span><div><strong>{session.title}</strong><small>{session.id === activeChatId ? "Current conversation" : "Open conversation"}</small></div></button>) : <p>Start a new conversation to keep it here.</p>}<p>New chats keep your earlier conversations available.</p></aside><div className="customer-chat"><div className="customer-chat-header"><span className="ai-avatar">S</span><div><strong>SupplyAI</strong><small>Customer support · Online</small></div><span className="chat-header-actions"><button onClick={clearChat}>Clear chat</button></span></div><div className="customer-chat-messages" aria-live="polite">{aiMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><p><ChatText content={message.content} /></p>{message.matches?.map((product) => <article className={`chat-product ${product.imageUrl ? "has-image" : "no-image"}`} key={product.id}>{product.imageUrl && <img src={product.imageUrl} alt="" onError={(event) => event.currentTarget.parentElement?.classList.add("no-image")} />}<div><strong>{product.name}</strong><small>{product.sku} · {product.availability}</small><b>From {money(product.price)}</b></div><button className="outline-button" onClick={() => add(product.id)}>Add to RFQ</button></article>)}{message.track && <form className="chat-track-card" onSubmit={trackRfq}><strong>Track an RFQ</strong><label>RFQ reference<input required value={track.reference} onChange={(event) => setTrack((current) => ({ ...current, reference: event.target.value }))} placeholder="RFQ-2026-0001" /></label><label>Work email<input required type="email" value={track.email} onChange={(event) => setTrack((current) => ({ ...current, email: event.target.value }))} placeholder="you@company.com" /></label><button className="primary-button" disabled={track.loading}>{track.loading ? "Checking..." : "Check status"}</button>{track.error && <small className="form-error">{track.error}</small>}{track.status && <div className="chat-track-status"><span>{track.reference}</span><strong className={`track-status ${track.status.toLowerCase()}`}>{track.status}</strong><p>{track.status === "NEW" ? "Received — the quote desk will review your request." : track.status === "REVIEWING" ? "Reviewing — availability and pricing are being checked." : track.status === "QUOTED" ? "Quoted — your quotation is ready." : track.status === "WON" ? "Accepted — fulfilment will follow." : "This RFQ is closed."}</p></div>}</form>}</div>)}{askingAi && <div className="chat-message assistant typing"><span></span><span></span><span></span></div>}</div><div className="chat-suggestions"><button onClick={() => setAiQuestion("I need an outdoor waterproof industrial socket.")}>Find a product</button><button onClick={() => setAiQuestion("I want to request a quote.")}>Create RFQ</button><button onClick={() => setAiQuestion("Track my RFQ status.")}>Track RFQ</button></div><form className="customer-chat-form" onSubmit={sendChat}><input required value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} placeholder="Message SupplyAI..." /><button className="primary-button" disabled={askingAi}>{askingAi ? "Replying..." : "Send"}</button></form></div>
          <aside className="chat-rfq-cart"><div className="rfq-summary-head"><div><span className="track-label">LIVE RFQ</span><h2>Your quote request</h2></div><b>{cartProducts.reduce((sum, item) => sum + item.quantity, 0)} pcs</b></div><p className="rfq-summary-copy">SupplyAI fills items and buyer details from your conversation.</p><div className="rfq-progress" role="tablist"><button className={rfqStep === "items" ? "current" : cartProducts.length ? "done" : ""} onClick={() => setRfqStep("items")}>1 <i>Items</i></button><button className={rfqStep === "details" ? "current" : buyerDetailsComplete ? "done" : ""} disabled={!cartProducts.length} onClick={() => setRfqStep("details")}>2 <i>Details</i></button><button className={rfqStep === "confirm" ? "current" : ""} disabled={!cartProducts.length || !buyerDetailsComplete} onClick={() => setRfqStep("confirm")}>3 <i>Confirm</i></button></div>{rfqStep === "items" && <div className="rfq-stage"><div className="rfq-stage-head"><strong>Products</strong><span>Review quantities before continuing.</span></div>{cartProducts.length ? <div className="chat-cart-items">{cartProducts.map(({ product, quantity }) => <article className={product.imageUrl ? "has-image" : "no-image"} key={product.id}>{product.imageUrl && <img src={product.imageUrl} alt="" onError={(event) => event.currentTarget.parentElement?.classList.add("no-image")} />}<div><strong>{product.name}</strong><small>{product.sku} · {quantity} pcs</small><b>{money(product.price * quantity)}</b><div className="chat-cart-item-actions"><label>Qty <input aria-label={`${product.name} quantity`} type="number" min="1" value={quantity} onChange={(event) => updateChatCart(product.id, event.currentTarget.valueAsNumber)} /></label><button type="button" aria-label={`Remove ${product.name}`} onClick={() => removeChatCart(product.id)}>Remove</button></div></div></article>)}</div> : <div className="chat-cart-empty"><strong>Your RFQ is empty</strong><span>Tell SupplyAI what you need, for example: “Add 50 outdoor sockets.”</span></div>}<button className="primary-button" disabled={!cartProducts.length} onClick={() => setRfqStep("details")}>Continue to details</button></div>}{rfqStep === "details" && <div className="rfq-stage"><div className="rfq-stage-head"><strong>Buyer details</strong><span>SupplyAI auto-fills these. Otherwise reply once with all details in chat.</span></div><div className="chat-rfq-form"><label>Name<input value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} autoComplete="name" /></label><label>Company<input value={customer.company} onChange={(event) => setCustomer((current) => ({ ...current, company: event.target.value }))} autoComplete="organization" /></label><label>Work email<input type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></label><label>Project note <small>(optional)</small><textarea rows={2} value={customer.note} onChange={(event) => setCustomer((current) => ({ ...current, note: event.target.value }))} placeholder="Site, deadline, or alternatives" /></label></div><button className="primary-button" disabled={!buyerDetailsComplete} onClick={() => setRfqStep("confirm")}>Review RFQ</button></div>}{rfqStep === "confirm" && <div className="rfq-stage chat-confirm"><strong>Ready to send this RFQ?</strong><p>{cartProducts.length} item{cartProducts.length === 1 ? "" : "s"} will be sent to the quote desk.</p><div className="chat-buyer-summary"><span>{customer.name}</span><strong>{customer.company}</strong><small>{customer.email}</small></div><div><button className="outline-button" onClick={() => setRfqStep("details")}>Back</button><button className="primary-button" disabled={saving} onClick={() => void submitChatRfq()}>Confirm and send</button></div></div>}</aside>
        </section>
      )}
      {view === "track" && (
        <section className="track-page">
          <div className="track-heading">
            <p className="kicker">Buyer RFQ tracker</p>
            <h1>
              Track your <em>quote request.</em>
            </h1>
            <p>
              Enter the RFQ reference and email address used when you submitted
              it.
            </p>
          </div>
          <form className="track-lookup" onSubmit={trackRfq}>
            <label>
              RFQ reference
              <input
                required
                value={track.reference}
                onChange={(e) =>
                  setTrack({ ...track, reference: e.target.value })
                }
                placeholder="RFQ-2026-0001"
              />
            </label>
            <label>
              Work email
              <input
                required
                type="email"
                value={track.email}
                onChange={(e) => setTrack({ ...track, email: e.target.value })}
                placeholder="you@company.com"
              />
            </label>
            <button className="primary-button" disabled={track.loading}>
              {track.loading ? "Checking…" : "Check status"}
            </button>
            {track.error && <p className="form-error">{track.error}</p>}
          </form>
          {track.status && (
            <div className="track-result">
              <div className="track-result-head">
                <div>
                  <span className="track-label">RFQ STATUS</span>
                  <h2>{track.reference}</h2>
                </div>
                <strong
                  className={`track-status ${track.status.toLowerCase()}`}
                >
                  {track.status}
                </strong>
              </div>
              <div className="track-steps">
                <div className="done">
                  <i>1</i>
                  <span>
                    Received<small>Your request is in our system.</small>
                  </span>
                </div>
                <div
                  className={
                    ["REVIEWING", "QUOTED", "WON", "LOST"].includes(
                      track.status,
                    )
                      ? "done"
                      : ""
                  }
                >
                  <i>2</i>
                  <span>
                    Reviewing<small>Our sales team checks availability.</small>
                  </span>
                </div>
                <div
                  className={
                    ["QUOTED", "WON", "LOST"].includes(track.status)
                      ? "done"
                      : ""
                  }
                >
                  <i>3</i>
                  <span>
                    Quoted<small>Pricing and terms are prepared.</small>
                  </span>
                </div>
                <div
                  className={
                    ["WON", "LOST"].includes(track.status) ? "done" : ""
                  }
                >
                  <i>4</i>
                  <span>
                    {track.status === "WON"
                      ? "Accepted"
                      : track.status === "LOST"
                        ? "Closed"
                        : "Decision"}
                    <small>
                      {track.status === "WON"
                        ? "Thank you for confirming."
                        : track.status === "LOST"
                          ? "This request is closed."
                          : "We’ll await your response."}
                    </small>
                  </span>
                </div>
              </div>
              <p className="track-next">
                {track.status === "NEW"
                  ? "Next: our team will review your requirements."
                  : track.status === "REVIEWING"
                    ? "Next: we’ll confirm suitable products and pricing."
                    : track.status === "QUOTED"
                      ? "Your quotation is ready. Please check your email."
                      : track.status === "WON"
                        ? "Your quote has been accepted. Our team will contact you about fulfilment."
                        : "Contact the supplier if you need further help."}
              </p>
              {track.quotation && ["SENT", "ACCEPTED", "REJECTED"].includes(track.quotation.status) && (() => { const subtotal = track.quotation.quotation_items.reduce((sum, item) => sum + item.quantity * Number(item.unit_price), 0); const discount = subtotal * Number(track.quotation.discount_percent || 0) / 100; const taxable = subtotal - discount; const sst = taxable * Number(track.quotation.tax_percent || 0) / 100; const total = taxable + sst + Number(track.quotation.delivery_fee || 0); return <div className="buyer-quote"><div><span className="track-label">QUOTATION</span><h3>{track.quotation.reference} · Rev {track.quotation.revision}</h3></div><div className="buyer-quote-table"><div><span>Item</span><span>Qty</span><span>Total</span></div>{track.quotation.quotation_items.map((item, index) => <div key={`${item.sku}-${index}`}><span><strong>{item.product_name}</strong><small>{item.sku}</small></span><span>{item.quantity}</span><strong>RM {(item.quantity * Number(item.unit_price)).toFixed(2)}</strong></div>)}</div><dl><div><dt>Subtotal</dt><dd>RM {subtotal.toFixed(2)}</dd></div><div><dt>Discount</dt><dd>− RM {discount.toFixed(2)}</dd></div><div><dt>SST</dt><dd>RM {sst.toFixed(2)}</dd></div><div><dt>Delivery</dt><dd>RM {Number(track.quotation.delivery_fee || 0).toFixed(2)}</dd></div><div className="total"><dt>Total</dt><dd>RM {total.toFixed(2)}</dd></div></dl>{track.quotation.status === "SENT" && <div className="buyer-quote-actions"><button type="button" disabled={track.loading} className="primary-button" onClick={() => respondToQuote("ACCEPTED")}>{track.loading ? "Saving…" : "Accept quotation"}</button><button type="button" disabled={track.loading} className="outline-button" onClick={() => respondToQuote("REJECTED")}>Decline</button></div>}{track.quotation.payment_terms && <p>Payment terms: {track.quotation.payment_terms}</p>}</div>; })()}
            </div>
          )}
        </section>
      )}
      {view === "admin" && !adminToken && (
        <div className="admin-login-overlay">
          <form className="admin-login-card" onSubmit={login}>
            <p className="kicker">SupplierFlow / Secure access</p>
            <h2>Admin sign in</h2>
            <p>Use a Supabase Auth account assigned a SupplierFlow staff role.</p>
            <label>
              Work email
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </label>
            {adminError && <p className="form-error">{adminError}</p>}
            <button className="primary-button" disabled={loggingIn}>
              {loggingIn ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setView("catalog")}
            >
              Back to catalogue
            </button>
          </form>
        </div>
      )}
      {view === "admin" && adminToken && (
        <AdminPortal
          token={adminToken}
          role={adminRole}
          demoTier={demoTier}
          notify={showToast}
          onSignOut={() => {
            sessionStorage.removeItem("supplierflow-admin-token");
            sessionStorage.removeItem("supplierflow-admin-refresh");
            sessionStorage.removeItem("supplierflow-admin-role");
            setAdminRole("admin");
            setAdminToken("");
            setView("catalog");
            showToast("Signed out.");
          }}
        />
      )}
      {view !== "admin" && (
        <SiteFooter logoUrl={logoUrl} companyName={companyName} onAdmin={() => setView("admin")} />
      )}
    </main>
  );
}
