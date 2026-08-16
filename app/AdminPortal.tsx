"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AdminModal, AdminPagination, AdminTable, AdminToolbar } from "./admin/AdminPrimitives";
import { SupplierFlowMark } from "./components/SiteChrome";
import { money } from "./lib/format";

type Section =
  "dashboard" | "knowledge" | "rfqs" | "quotations" | "products" | "files" | "settings";
type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  summary: string;
  specifications?: string[];
  availability?: string;
  image_type?: string;
  image_url?: string | null;
  datasheet_path?: string | null;
  price: number;
  is_active: boolean;
};
type RfqItem = {
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
};
type Rfq = {
  id: string;
  reference: string;
  customer_name: string;
  company_name: string;
  email: string;
  status: string;
  requirements?: string;
  rfq_items: RfqItem[];
  activity_logs?: Array<{ id: string; message: string }>;
};
type QuoteItem = {
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  is_alternative: boolean;
};
type Quote = {
  id: string;
  rfq_id: string;
  reference: string;
  revision: number;
  status: string;
  discount_percent: number;
  tax_percent: number;
  delivery_fee: number;
  validity_days: number;
  payment_terms?: string;
  created_at: string;
  rfqs?: {
    reference: string;
    company_name: string;
    customer_name: string;
    email: string;
  };
  quotation_items: QuoteItem[];
};
type Settings = {
  company_name: string;
  registration_number?: string;
  address?: string;
  email?: string;
  phone?: string;
  logo_url?: string | null;
  quotation_validity_days: number;
  payment_terms?: string;
  sst_percent: number;
};
type KnowledgeDocument = {
  id: string;
  title: string;
  source_type: string;
  created_at?: string;
  knowledge_chunks?: Array<{ count: number }>;
};
type Line = RfqItem & { unitPrice: number };

const menu: Array<[Section, string]> = [
  ["dashboard", "Overview"],
  ["knowledge", "Knowledge base"],
  ["rfqs", "RFQ inbox"],
  ["quotations", "Quotations"],
  ["products", "Products"],
  ["settings", "Company settings"],
];
const blankProduct = {
  id: "",
  name: "",
  sku: "",
  category: "Accessories",
  summary: "",
  specs: "",
  availability: "In stock",
  imageClass: "accessory",
  imageUrl: "",
  datasheetPath: "",
  price: "",
  isActive: true,
};

function valuesFor(
  items: Array<{ quantity: number; unit_price: number }>,
  discount: number,
  tax: number,
  delivery: number,
) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
    0,
  );
  const discountValue = (subtotal * Number(discount || 0)) / 100;
  const taxable = subtotal - discountValue;
  const taxValue = (taxable * Number(tax || 0)) / 100;
  return {
    subtotal,
    discountValue,
    taxable,
    taxValue,
    total: taxable + taxValue + Number(delivery || 0),
  };
}

export function AdminPortal({
  token,
  onSignOut,
  notify,
}: {
  token: string;
  onSignOut: () => void;
  notify: (message: string) => void;
}) {
  const [section, setSection] = useState<Section>("dashboard");
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>({
    company_name: "SupplierFlow Electrical Sdn Bhd",
    quotation_validity_days: 14,
    payment_terms: "30 days",
    sst_percent: 6,
  });
  const [selectedRfq, setSelectedRfq] = useState<Rfq | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(6);
  const [delivery, setDelivery] = useState(0);
  const [notice, setNotice] = useState("");
  const [productDraft, setProductDraft] = useState(blankProduct);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [seedingProducts, setSeedingProducts] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [rfqFilter, setRfqFilter] = useState("ALL");
  const [quoteFilter, setQuoteFilter] = useState("ALL");
  const [rfqSearch, setRfqSearch] = useState("");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [rfqPage, setRfqPage] = useState(1);
  const [quotePage, setQuotePage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [activityNote, setActivityNote] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeDocument[]>([]);
  const [knowledgeDraft, setKnowledgeDraft] = useState({ title: "", sourceType: "policy", content: "" });
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState("ALL");
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeDocument | null>(null);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function load() {
    const calls = await Promise.allSettled([
      fetch("/api/admin/dashboard", { headers }).then(async (r) =>
        r.ok ? r.json() : Promise.reject(),
      ),
      fetch("/api/admin/products", { headers }).then(async (r) =>
        r.ok ? r.json() : Promise.reject(),
      ),
      fetch("/api/admin/settings", { headers }).then(async (r) =>
        r.ok ? r.json() : Promise.reject(),
      ),
    ]);
    if (calls[0].status === "fulfilled") {
      setRfqs(calls[0].value.rfqs);
      setQuotes(calls[0].value.quotations);
    }
    if (calls[1].status === "fulfilled") setProducts(calls[1].value.products);
    if (calls[2].status === "fulfilled" && calls[2].value.settings)
      setSettings(calls[2].value.settings);
    fetch("/api/admin/knowledge", { headers }).then((response) => response.ok ? response.json() : null).then((data) => data && setKnowledge(data.documents)).catch(() => undefined);
    if (calls.some((call) => call.status === "rejected")) {
      setNotice(
        "Some admin data could not load. Run the latest Supabase schema, then refresh.",
      );
      notify("Some admin data could not load.");
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const closeModal = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedRfq(null);
      setSelectedQuote(null);
      setProductModalOpen(false);
      setKnowledgeModalOpen(false);
      setSelectedKnowledge(null);
    };
    window.addEventListener("keydown", closeModal);
    return () => window.removeEventListener("keydown", closeModal);
  }, []);
  const quoteValue = useMemo(
    () =>
      quotes.reduce(
        (sum, quote) =>
          sum +
          valuesFor(
            quote.quotation_items,
            quote.discount_percent,
            quote.tax_percent,
            quote.delivery_fee,
          ).total,
        0,
      ),
    [quotes],
  );
  const current = valuesFor(
    lines.map((line) => ({
      quantity: line.quantity,
      unit_price: line.unitPrice,
    })),
    discount,
    tax,
    delivery,
  );
  const pageSize = 8;
  const filteredRfqs = rfqs.filter((rfq) => {
    const query = rfqSearch.trim().toLowerCase();
    return (rfqFilter === "ALL" || rfq.status === rfqFilter) &&
      (!query || [rfq.reference, rfq.company_name, rfq.customer_name, rfq.email, rfq.requirements].some((value) => String(value || "").toLowerCase().includes(query)));
  });
  const filteredQuotes = quotes.filter((quote) => {
    const query = quoteSearch.trim().toLowerCase();
    return (quoteFilter === "ALL" || quote.status === quoteFilter) &&
      (!query || [quote.reference, quote.rfqs?.company_name, quote.rfqs?.customer_name, quote.rfqs?.email].some((value) => String(value || "").toLowerCase().includes(query)));
  });
  const filteredProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    return (productFilter === "ALL" || (productFilter === "ACTIVE" ? product.is_active : !product.is_active)) && (!query || [product.name, product.sku, product.category, product.summary, product.availability].some((value) => String(value || "").toLowerCase().includes(query)));
  });
  const visibleRfqs = filteredRfqs.slice((rfqPage - 1) * pageSize, rfqPage * pageSize);
  const visibleQuotes = filteredQuotes.slice((quotePage - 1) * pageSize, quotePage * pageSize);
  const visibleProducts = filteredProducts.slice((productPage - 1) * pageSize, productPage * pageSize);
  const rfqPageCount = Math.max(1, Math.ceil(filteredRfqs.length / pageSize));
  const quotePageCount = Math.max(1, Math.ceil(filteredQuotes.length / pageSize));
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const filteredKnowledge = knowledge.filter((document) => {
    const query = knowledgeSearch.trim().toLowerCase();
    return (knowledgeFilter === "ALL" || document.source_type.toUpperCase() === knowledgeFilter) && (!query || [document.title, document.source_type].some((value) => String(value || "").toLowerCase().includes(query)));
  });
  const visibleKnowledge = filteredKnowledge.slice((knowledgePage - 1) * pageSize, knowledgePage * pageSize);
  const knowledgePageCount = Math.max(1, Math.ceil(filteredKnowledge.length / pageSize));

  function openRfq(rfq: Rfq) {
    setSelectedRfq(rfq);
    setLines(
      rfq.rfq_items.map((item) => ({
        ...item,
        unitPrice: Number(
          products.find((product) => product.id === item.product_id)?.price ||
            0,
        ),
      })),
    );
    setDiscount(0);
    setTax(Number(settings.sst_percent));
    setDelivery(0);
  }
  function editProduct(product: Product) {
    setProductDraft({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      summary: product.summary || "",
      specs: (product.specifications || []).join(", "),
      availability: product.availability || "In stock",
      imageClass: product.image_type || "accessory",
      imageUrl: product.image_url || "",
      datasheetPath: product.datasheet_path || "",
      price: String(product.price || ""),
      isActive: product.is_active,
    });
    setProductModalOpen(true);
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProduct(true);
    setNotice("");
    notify("Saving product…");
    const response = await fetch("/api/admin/products", {
      method: productDraft.id ? "PATCH" : "POST",
      headers,
      body: JSON.stringify({
        ...productDraft,
        price: Number(productDraft.price),
        specs: productDraft.specs
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });
    setSavingProduct(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.error || "Product could not be saved. Check the required fields.";
      setNotice(message);
      notify(message);
      return;
    }
    setProductDraft(blankProduct);
    setProductModalOpen(false);
    setNotice("Product saved.");
    notify("Product saved.");
    await load();
  }
  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    kind: "image" | "document" | "logo",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    notify("Uploading file…");
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind === "document" ? "document" : "image");
    const response = await fetch("/api/admin/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) {
      setNotice("Upload failed. Use JPG, PNG, WebP, or PDF.");
      notify("File upload failed.");
      return;
    }
    const data = await response.json();
    if (kind === "document")
      setProductDraft((draft) => ({ ...draft, datasheetPath: data.url }));
    else if (kind === "logo") {
      const next = { ...settings, logo_url: data.url };
      setSettings(next);
      await fetch("/api/admin/settings", { method: "PUT", headers, body: JSON.stringify(next) });
    }
    else setProductDraft((draft) => ({ ...draft, imageUrl: data.url }));
    setNotice("File uploaded. Save the product or settings to keep it.");
    notify("File uploaded. Save to keep it.");
  }
  async function importProducts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    notify("Importing products…");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames[0]],
      { defval: "" },
    );
    let saved = 0;
    for (const row of rows) {
      const name = String(row.Name || row.name || "").trim();
      const sku = String(row.SKU || row.sku || "").trim();
      const category = String(row.Category || row.category || "").trim();
      const summary = String(
        row.Description || row.Summary || row.summary || "",
      ).trim();
      if (!name || !sku || !category || !summary) continue;
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          sku,
          category,
          summary,
          price: Number(row.Price || row.price || 0),
          specs: String(row.Specifications || row.specs || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          availability: String(row.Availability || "In stock"),
          imageUrl: String(row.ImageUrl || ""),
          datasheetPath: String(row.DatasheetUrl || ""),
        }),
      });
      if (response.ok) saved += 1;
    }
    setNotice(`${saved} product${saved === 1 ? "" : "s"} imported.`);
    notify(`${saved} product${saved === 1 ? "" : "s"} imported.`);
    event.target.value = "";
    await load();
  }
  async function seedProducts() {
    if (seedingProducts) return;
    setSeedingProducts(true);
    notify("Loading demo catalogue…");
    const response = await fetch("/api/admin/products/seed", {
      method: "POST",
      headers,
    });
    const data = await response.json();
    setSeedingProducts(false);
    if (!response.ok) {
      setNotice("Official catalogue could not be loaded.");
      notify("Official catalogue could not be loaded.");
      return;
    }
    setNotice(`${data.added} official products loaded; previous active products hidden.`);
    notify(`${data.added} official products loaded; previous active products hidden.`);
    await load();
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);
    notify("Saving company settings…");
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify(settings),
    });
    setSavingSettings(false);
    if (!response.ok) {
      setNotice("Settings could not be saved.");
      notify("Settings could not be saved.");
      return;
    }
    setSettings((await response.json()).settings);
    setNotice("Company settings saved.");
    notify("Company settings saved.");
  }
  async function saveQuote(send: boolean) {
    if (!selectedRfq || !lines.length || savingQuote) return;
    setSavingQuote(true);
    notify(send ? "Sending quotation…" : "Saving quotation draft…");
    const revision =
      Math.max(
        0,
        ...quotes
          .filter((quote) => quote.rfq_id === selectedRfq.id)
          .map((quote) => quote.revision),
      ) + 1;
    const response = await fetch("/api/admin/quotations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        rfqId: selectedRfq.id,
        reference: `Q-${selectedRfq.reference.replace("RFQ-", "")}-R${revision}`,
        revision,
        discountPercent: discount,
        taxPercent: tax,
        deliveryFee: delivery,
        validityDays: settings.quotation_validity_days,
        paymentTerms: settings.payment_terms,
        send,
        items: lines.map((line) => ({
          requestedProductId: line.product_id,
          productId: line.product_id,
          productName: line.product_name,
          sku: line.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      }),
    });
    if (!response.ok) {
      setSavingQuote(false);
      setNotice("Quotation could not be saved.");
      notify("Quotation could not be saved.");
      return;
    }
    setNotice(send ? "Quotation saved and emailed." : "Quotation draft saved.");
    notify(send ? "Quotation sent." : "Quotation draft saved.");
    await load();
    setSavingQuote(false);
    setSection("quotations");
  }
  async function updateRfqStatus(status: string) {
    if (!selectedRfq || updatingStatus) return;
    setUpdatingStatus(true); notify(`Marking RFQ ${status.toLowerCase()}…`);
    const response = await fetch("/api/admin/rfqs", { method: "PATCH", headers, body: JSON.stringify({ id: selectedRfq.id, status }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("RFQ status could not be updated."); return; }
    setSelectedRfq({ ...selectedRfq, status }); notify(`RFQ marked ${status}.`); await load();
  }
  async function addActivityNote() {
    if (!selectedRfq || !activityNote.trim() || updatingStatus) return;
    setUpdatingStatus(true); notify("Saving RFQ note…");
    const response = await fetch("/api/admin/rfqs", { method: "PATCH", headers, body: JSON.stringify({ id: selectedRfq.id, note: activityNote }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("RFQ note could not be saved."); return; }
    setActivityNote(""); notify("RFQ note saved."); await load();
  }
  async function saveKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savingKnowledge) return;
    setSavingKnowledge(true); notify("Processing knowledge document…");
    const response = await fetch("/api/admin/knowledge", { method: "POST", headers, body: JSON.stringify(knowledgeDraft) }); const data = await response.json(); setSavingKnowledge(false);
    if (!response.ok) { notify(data.error || "Knowledge document could not be saved."); return; }
    setKnowledgeDraft({ title: "", sourceType: "policy", content: "" }); setKnowledgeModalOpen(false); notify(data.embedded ? `Knowledge saved and vector-indexed in ${data.chunks} chunks.` : "Knowledge saved. Keyword retrieval is active."); await load();
  }
  function openKnowledge(document: KnowledgeDocument) {
    setSelectedKnowledge(document);
    setKnowledgeDraft({ title: document.title, sourceType: document.source_type, content: "" });
    setKnowledgeModalOpen(true);
  }
  function newKnowledge() {
    setSelectedKnowledge(null);
    setKnowledgeDraft({ title: "", sourceType: "policy", content: "" });
    setKnowledgeModalOpen(true);
  }
  async function updateQuoteStatus(status: string) {
    if (!selectedQuote || updatingStatus) return;
    setUpdatingStatus(true); notify(`Marking quotation ${status.toLowerCase()}…`);
    const response = await fetch("/api/admin/quotations", { method: "PATCH", headers, body: JSON.stringify({ id: selectedQuote.id, rfqId: selectedQuote.rfq_id, status }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("Quotation status could not be updated."); return; }
    setSelectedQuote({ ...selectedQuote, status }); notify(`Quotation marked ${status}.`); await load();
  }
  function print(quote: Quote) {
    const data = valuesFor(
      quote.quotation_items,
      quote.discount_percent,
      quote.tax_percent,
      quote.delivery_fee,
    );
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(
      `<main style="font-family:Arial;padding:48px;color:#172033"><h1>${settings.company_name}</h1><h2>Quotation ${quote.reference}</h2><p>${quote.rfqs?.company_name || "Customer"}<br/>${quote.rfqs?.customer_name || ""}</p><table style="width:100%;border-collapse:collapse">${quote.quotation_items.map((item) => `<tr><td style="padding:10px 0">${item.product_name}<br/><small>${item.sku}</small></td><td>${item.quantity}</td><td>${money(Number(item.unit_price))}</td><td>${money(Number(item.quantity) * Number(item.unit_price))}</td></tr>`).join("")}</table><hr/><p>Subtotal: ${money(data.subtotal)}<br/>Discount: −${money(data.discountValue)}<br/>SST: ${money(data.taxValue)}<br/>Delivery: ${money(Number(quote.delivery_fee || 0))}<br/><b style="font-size:20px">Grand total: ${money(data.total)}</b></p></main><script>print()</script>`,
    );
    popup.document.close();
  }
  const quoteDetail =
    selectedQuote &&
    valuesFor(
      selectedQuote.quotation_items,
      selectedQuote.discount_percent,
      selectedQuote.tax_percent,
      selectedQuote.delivery_fee,
    );

  return (
    <section className="admin-portal">
      <aside className="portal-sidebar">
        <button className="portal-brand">
          <SupplierFlowMark />
        </button>
        <nav className="portal-nav">
          {menu.map(([id, label]) => (
            <button
              className={section === id ? "active" : ""}
              key={id}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="portal-signout" onClick={onSignOut}>
          Sign out
        </button>
      </aside>
      <main className="portal-main">
        <header className="portal-header">
          <div>
            <p className="kicker">Administration</p>
            <h1>{menu.find(([id]) => id === section)?.[1]}</h1>
          </div>
          <span className="portal-user">AD</span>
        </header>
        {notice && (
          <div className="portal-notice">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        {section === "dashboard" && (
          <>
            <div className="portal-kpis">
              <article>
                <span>Open RFQs</span>
                <strong>
                  {
                    rfqs.filter((rfq) =>
                      ["NEW", "REVIEWING"].includes(rfq.status),
                    ).length
                  }
                </strong>
              </article>
              <article>
                <span>Quotation value</span>
                <strong>{money(quoteValue)}</strong>
              </article>
              <article>
                <span>Won RFQs</span>
                <strong>
                  {rfqs.filter((rfq) => rfq.status === "WON").length}
                </strong>
              </article>
              <article>
                <span>Active products</span>
                <strong>
                  {products.filter((product) => product.is_active).length}
                </strong>
              </article>
            </div>
            <article className="portal-card">
              <p className="kicker">Recent RFQs</p>
              {rfqs.slice(0, 6).map((rfq) => (
                <button
                  className="portal-row"
                  key={rfq.id}
                  onClick={() => {
                    openRfq(rfq);
                    setSection("rfqs");
                  }}
                >
                  <span>
                    <strong>{rfq.reference}</strong>
                    <small>{rfq.company_name}</small>
                  </span>
                  <em>{rfq.status}</em>
                </button>
              ))}
            </article>
          </>
        )}
        {section === "knowledge" && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="RAG knowledge" title={`${filteredKnowledge.length} documents`} searchLabel="Search knowledge" search={knowledgeSearch} onSearch={(value) => { setKnowledgeSearch(value); setKnowledgePage(1); }} placeholder="Title or document type..." actions={<button className="primary-button" onClick={newKnowledge}>Add document</button>} />
            <div className="status-filters">{["ALL", "POLICY", "FAQ", "SOP", "DATASHEET"].map((status) => <button className={knowledgeFilter === status ? "active" : ""} key={status} onClick={() => { setKnowledgeFilter(status); setKnowledgePage(1); }}>{status === "ALL" ? "All" : status}</button>)}</div>
            <AdminTable rows={visibleKnowledge} empty="No knowledge documents match this search." columns={[
              { key: "title", label: "Document", render: (document) => <button className="table-cell-button" onClick={() => openKnowledge(document)}><strong>{document.title}</strong><small>{document.source_type.toUpperCase()}</small></button> },
              { key: "type", label: "Type", render: (document) => <em className="status-chip sent">{document.source_type.toUpperCase()}</em> },
              { key: "chunks", label: "Chunks", render: (document) => `${document.knowledge_chunks?.[0]?.count || 0} indexed` },
              { key: "created", label: "Created", render: (document) => document.created_at ? new Date(document.created_at).toLocaleDateString("en-MY") : "—" },
              { key: "action", label: "Action", render: (document) => <button className="table-action" onClick={() => openKnowledge(document)}>View</button> },
            ]} />
            <AdminPagination page={knowledgePage} pageCount={knowledgePageCount} total={filteredKnowledge.length} pageSize={pageSize} onPageChange={setKnowledgePage} />
            {knowledgeModalOpen && <AdminModal titleId="knowledge-modal-title" label="Close knowledge editor" onClose={() => setKnowledgeModalOpen(false)} className="knowledge-editor-modal"><p className="kicker">{selectedKnowledge ? "Knowledge document" : "New knowledge"}</p><h2 id="knowledge-modal-title">{selectedKnowledge ? "Add a new indexed version" : "Add company knowledge"}</h2><p className="portal-hint">Add FAQ, delivery policy, warranty terms, or sales SOP. Text is split into chunks for retrieval.</p><form className="copilot-form" onSubmit={saveKnowledge}><label>Document title<input required value={knowledgeDraft.title} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, title: event.target.value })} placeholder="Delivery policy" /></label><label>Document type<select value={knowledgeDraft.sourceType} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, sourceType: event.target.value })}><option value="policy">Policy</option><option value="faq">FAQ</option><option value="sop">Sales SOP</option><option value="datasheet">Datasheet notes</option></select></label><label>Knowledge text<textarea required rows={11} value={knowledgeDraft.content} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, content: event.target.value })} placeholder="Klang Valley deliveries take 1–2 working days..." /></label><button className="primary-button" disabled={savingKnowledge}>{savingKnowledge ? "Indexing…" : "Save to knowledge base"}</button></form></AdminModal>}
          </div>
        )}
        {section === "rfqs" && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="Request queue" title={`${filteredRfqs.length} RFQs`} searchLabel="Search RFQs" search={rfqSearch} onSearch={(value) => { setRfqSearch(value); setRfqPage(1); }} placeholder="Reference, company, contact..." />
            <div className="status-filters">
              {["ALL", "NEW", "REVIEWING", "QUOTED", "WON", "LOST"].map((status) => <button className={rfqFilter === status ? "active" : ""} key={status} onClick={() => { setRfqFilter(status); setRfqPage(1); }}>{status === "ALL" ? "All" : status}</button>)}
            </div>
            <AdminTable
              rows={visibleRfqs}
              empty="No RFQs match this search."
              onRowClick={openRfq}
              columns={[
                { key: "reference", label: "Reference", render: (rfq) => <><strong>{rfq.reference}</strong><small>{rfq.requirements || "No requirements added"}</small></> },
                { key: "customer", label: "Customer", render: (rfq) => <><strong>{rfq.company_name}</strong><small>{rfq.customer_name}</small></> },
                { key: "items", label: "Items", render: (rfq) => `${rfq.rfq_items.length} line${rfq.rfq_items.length === 1 ? "" : "s"}` },
                { key: "contact", label: "Contact", render: (rfq) => <small>{rfq.email}</small> },
                { key: "status", label: "Status", render: (rfq) => <em className={`status-chip ${rfq.status.toLowerCase()}`}>{rfq.status}</em> },
                { key: "action", label: "Action", render: (rfq) => <button className="table-action" onClick={(event) => { event.stopPropagation(); openRfq(rfq); }}>View</button> },
              ]}
            />
            <AdminPagination page={rfqPage} pageCount={rfqPageCount} total={filteredRfqs.length} pageSize={pageSize} onPageChange={setRfqPage} />
            {selectedRfq && <AdminModal titleId="rfq-modal-title" label="Close RFQ details" onClose={() => setSelectedRfq(null)} className="rfq-modal">
              {selectedRfq ? (
                <>
                  <p className="kicker">{selectedRfq.reference}</p>
                  <h2 id="rfq-modal-title">{selectedRfq.company_name}</h2>
                  <p>
                    {selectedRfq.customer_name} · {selectedRfq.email}
                  </p>
                  <div className="status-actions">
                    {selectedRfq.status === "NEW" && <button disabled={updatingStatus} onClick={() => updateRfqStatus("REVIEWING")}>Start reviewing</button>}
                    {["NEW", "REVIEWING", "QUOTED"].includes(selectedRfq.status) && <button disabled={updatingStatus} onClick={() => updateRfqStatus("LOST")}>Mark lost</button>}
                    {selectedRfq.status === "REVIEWING" && <span>Save or send a quotation to mark this RFQ quoted.</span>}
                  </div>
                  <div className="activity-note"><input value={activityNote} onChange={(e) => setActivityNote(e.target.value)} placeholder="Add follow-up note or call outcome" /><button disabled={updatingStatus || !activityNote.trim()} onClick={addActivityNote}>Add note</button>{selectedRfq.activity_logs?.slice(0, 3).map((log) => <small key={log.id}>{log.message}</small>)}</div>
                  <div className="quote-editor">
                    <div className="saved-quote-table">
                      <div className="saved-quote-head">
                        <span>Item</span>
                        <span>Qty</span>
                        <span>Unit price</span>
                        <span>Total</span>
                      </div>
                      {lines.map((line, index) => (
                        <div
                          className="saved-quote-line quote-edit-line"
                          key={`${line.product_id}-${index}`}
                        >
                          <span>
                            <strong>{line.product_name}</strong>
                            <small>{line.sku}</small>
                          </span>
                          <input
                            aria-label={`Quantity for ${line.product_name}`}
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) =>
                              setLines(
                                lines.map((entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        quantity: Number(e.target.value),
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <input
                            aria-label={`Unit price for ${line.product_name}`}
                            type="number"
                            min="0"
                            value={line.unitPrice}
                            onChange={(e) =>
                              setLines(
                                lines.map((entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        unitPrice: Number(e.target.value),
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <strong>
                            {money(line.quantity * line.unitPrice)}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <div className="quote-options">
                      <label>
                        Discount %
                        <input
                          type="number"
                          min="0"
                          value={discount}
                          onChange={(e) => setDiscount(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        SST %
                        <input
                          type="number"
                          min="0"
                          value={tax}
                          onChange={(e) => setTax(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Delivery (RM)
                        <input
                          type="number"
                          min="0"
                          value={delivery}
                          onChange={(e) => setDelivery(Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <dl className="saved-quote-totals">
                      <div>
                        <dt>Subtotal</dt>
                        <dd>{money(current.subtotal)}</dd>
                      </div>
                      <div>
                        <dt>Discount ({discount}%)</dt>
                        <dd>− {money(current.discountValue)}</dd>
                      </div>
                      <div>
                        <dt>Taxable amount</dt>
                        <dd>{money(current.taxable)}</dd>
                      </div>
                      <div>
                        <dt>SST ({tax}%)</dt>
                        <dd>{money(current.taxValue)}</dd>
                      </div>
                      <div>
                        <dt>Delivery</dt>
                        <dd>{money(delivery)}</dd>
                      </div>
                      <div className="grand">
                        <dt>Grand total</dt>
                        <dd>{money(current.total)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="portal-actions">
                    <button
                      disabled={savingQuote}
                      onClick={() => saveQuote(false)}
                    >
                      {savingQuote ? "Saving…" : "Save draft"}
                    </button>
                    <button
                      disabled={savingQuote}
                      className="primary-button"
                      onClick={() => saveQuote(true)}
                    >
                      {savingQuote ? "Sending…" : "Send quotation"}
                    </button>
                  </div>
                </>
              ) : (
                <p>Select an RFQ.</p>
              )}
            </AdminModal>}
          </div>
        )}
        {section === "quotations" && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="Quote register" title={`${filteredQuotes.length} quotations`} searchLabel="Search quotations" search={quoteSearch} onSearch={(value) => { setQuoteSearch(value); setQuotePage(1); }} placeholder="Reference, company, contact..." />
            <article className="portal-card">
              <div className="status-filters">
                {["ALL", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"].map((status) => <button className={quoteFilter === status ? "active" : ""} key={status} onClick={() => setQuoteFilter(status)}>{status === "ALL" ? "All" : status}</button>)}
              </div>
              <AdminTable
                rows={visibleQuotes}
                empty="No quotations match this search."
                onRowClick={setSelectedQuote}
                columns={[
                  { key: "reference", label: "Reference", render: (quote) => <><strong>{quote.reference}</strong><small>{quote.quotation_items.length} line{quote.quotation_items.length === 1 ? "" : "s"}</small></> },
                  { key: "customer", label: "Customer", render: (quote) => <><strong>{quote.rfqs?.company_name || "Customer"}</strong><small>{quote.rfqs?.customer_name || "—"}</small></> },
                  { key: "revision", label: "Revision", render: (quote) => `Rev ${quote.revision}` },
                  { key: "issued", label: "Issued", render: (quote) => <small>{quote.created_at ? new Date(quote.created_at).toLocaleDateString("en-MY") : "—"}</small> },
                  { key: "total", label: "Total", render: (quote) => <strong>{money(valuesFor(quote.quotation_items, quote.discount_percent, quote.tax_percent, quote.delivery_fee).total)}</strong> },
                  { key: "status", label: "Status", render: (quote) => <em className={`status-chip ${quote.status.toLowerCase()}`}>{quote.status}</em> },
                  { key: "action", label: "Action", render: (quote) => <button className="table-action" onClick={(event) => { event.stopPropagation(); setSelectedQuote(quote); }}>View</button> },
                ]}
              />
              <AdminPagination page={quotePage} pageCount={quotePageCount} total={filteredQuotes.length} pageSize={pageSize} onPageChange={setQuotePage} />
            </article>
            {selectedQuote && quoteDetail && <AdminModal titleId="quote-modal-title" label="Close quotation details" onClose={() => setSelectedQuote(null)} className="saved-quote">
              {selectedQuote && quoteDetail ? (
                <>
                  <div className="saved-quote-header">
                    <div>
                      <p className="kicker">
                        {selectedQuote.reference} · Rev {selectedQuote.revision}
                      </p>
                      <h2 id="quote-modal-title">{selectedQuote.rfqs?.company_name || "Quotation"}</h2>
                      <p>
                        {selectedQuote.rfqs?.customer_name || "—"} ·{" "}
                        {selectedQuote.rfqs?.email || "—"}
                      </p>
                    </div>
                    <em>{selectedQuote.status}</em>
                  </div>
                  <div className="saved-quote-table">
                    <div className="saved-quote-head">
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Unit price</span>
                      <span>Total</span>
                    </div>
                    {selectedQuote.quotation_items.map((item, index) => (
                      <div
                        className="saved-quote-line"
                        key={`${item.sku}-${index}`}
                      >
                        <span>
                          <strong>{item.product_name}</strong>
                          <small>
                            {item.sku}
                            {item.is_alternative ? " · Alternative" : ""}
                          </small>
                        </span>
                        <span>{item.quantity}</span>
                        <span>{money(Number(item.unit_price))}</span>
                        <strong>
                          {money(
                            Number(item.quantity) * Number(item.unit_price),
                          )}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <dl className="saved-quote-totals">
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(quoteDetail.subtotal)}</dd>
                    </div>
                    <div>
                      <dt>Discount ({selectedQuote.discount_percent}%)</dt>
                      <dd>− {money(quoteDetail.discountValue)}</dd>
                    </div>
                    <div>
                      <dt>Taxable amount</dt>
                      <dd>{money(quoteDetail.taxable)}</dd>
                    </div>
                    <div>
                      <dt>SST ({selectedQuote.tax_percent}%)</dt>
                      <dd>{money(quoteDetail.taxValue)}</dd>
                    </div>
                    <div>
                      <dt>Delivery</dt>
                      <dd>{money(Number(selectedQuote.delivery_fee || 0))}</dd>
                    </div>
                    <div className="grand">
                      <dt>Grand total</dt>
                      <dd>{money(quoteDetail.total)}</dd>
                    </div>
                  </dl>
                  <div className="portal-actions">
                    <button onClick={() => print(selectedQuote)}>
                      Print / PDF
                    </button>
                    {selectedQuote.status === "DRAFT" && <button disabled={updatingStatus} className="primary-button" onClick={() => updateQuoteStatus("SENT")}>Mark sent</button>}
                    {selectedQuote.status === "SENT" && <><button disabled={updatingStatus} className="accept-action" onClick={() => updateQuoteStatus("ACCEPTED")}>Mark accepted</button><button disabled={updatingStatus} className="reject-action" onClick={() => updateQuoteStatus("REJECTED")}>Mark rejected</button></>}
                    {["DRAFT", "SENT"].includes(selectedQuote.status) && <button disabled={updatingStatus} onClick={() => updateQuoteStatus("EXPIRED")}>Mark expired</button>}
                    <button
                      onClick={() => {
                        const rfq = rfqs.find(
                          (item) => item.id === selectedQuote.rfq_id,
                        );
                        if (rfq) {
                          openRfq(rfq);
                          setSection("rfqs");
                        }
                      }}
                    >
                      Create revision
                    </button>
                  </div>
                </>
              ) : (
                <p>
                  Select a quotation to display every item, price, discount,
                  SST, delivery, and total.
                </p>
              )}
            </AdminModal>}
          </div>
        )}
        {section === "products" && (
          <div className="admin-table-card portal-card admin-products-page">
            {productModalOpen && <AdminModal titleId="product-modal-title" label="Close product editor" onClose={() => setProductModalOpen(false)} className="product-editor-modal">
              <div className="portal-card-heading">
                <div>
                  <p className="kicker">Product CMS</p>
                  <h2 id="product-modal-title">{productDraft.id ? "Edit product" : "Add product"}</h2>
                </div>
                {productDraft.id && (
                  <button onClick={() => { setProductDraft(blankProduct); setProductModalOpen(true); }}>
                    New product
                  </button>
                )}
              </div>
              <div className="product-edit-preview">
                {productDraft.imageUrl ? (
                  <img
                    src={productDraft.imageUrl}
                    alt={`Preview of ${productDraft.name || "product"}`}
                  />
                ) : (
                  <span>Product photo preview</span>
                )}
              </div>
              <form className="portal-form" onSubmit={saveProduct}>
                <label>
                  Name
                  <input
                    required
                    value={productDraft.name}
                    onChange={(e) =>
                      setProductDraft({ ...productDraft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  SKU
                  <input
                    required
                    value={productDraft.sku}
                    onChange={(e) =>
                      setProductDraft({ ...productDraft, sku: e.target.value })
                    }
                  />
                </label>
                <label>
                  Category
                  <input
                    required
                    value={productDraft.category}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        category: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Public price (RM)
                  <input
                    required
                    min="0"
                    type="number"
                    value={productDraft.price}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        price: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="full">
                  Description
                  <textarea
                    required
                    rows={3}
                    value={productDraft.summary}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        summary: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="full">
                  Specifications <small>Comma-separated</small>
                  <input
                    value={productDraft.specs}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        specs: e.target.value,
                      })
                    }
                    placeholder="Voltage: 240V, Rating: 32A"
                  />
                </label>
                <label>
                  Availability
                  <select
                    value={productDraft.availability}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        availability: e.target.value,
                      })
                    }
                  >
                    <option>In stock</option>
                    <option>Low stock</option>
                    <option>Pre-order</option>
                  </select>
                </label>
                <label>
                  Visible in catalogue
                  <select
                    value={String(productDraft.isActive)}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        isActive: e.target.value === "true",
                      })
                    }
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <label>
                  Product photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => upload(e, "image")}
                  />
                  {productDraft.imageUrl && <small>Photo attached</small>}
                </label>
                <label>
                  Datasheet PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => upload(e, "document")}
                  />
                  {productDraft.datasheetPath && (
                    <small>Datasheet attached</small>
                  )}
                </label>
                <div className="portal-actions full">
                  <button
                    type="button"
                    onClick={() => setProductDraft(blankProduct)}
                  >
                    Clear
                  </button>
                  <button className="primary-button" disabled={savingProduct}>
                    {savingProduct ? "Saving…" : "Save product"}
                  </button>
                </div>
              </form>
            </AdminModal>}
            <article className="portal-card product-table-panel">
              <AdminToolbar eyebrow="Catalogue" title={`${filteredProducts.length} products`} searchLabel="Search products" search={productSearch} onSearch={(value) => { setProductSearch(value); setProductPage(1); }} placeholder="Name, SKU, category..." actions={<>
                <label className="import-button">
                  Import Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={importProducts}
                  />
                </label>
                <button className="primary-button" onClick={() => { setProductDraft(blankProduct); setProductModalOpen(true); }}>Add product</button>
                <button className="outline-button" disabled={seedingProducts} onClick={seedProducts}>{seedingProducts ? "Replacing…" : "Replace catalogue"}</button>
              </>} />
              {products.length === 0 && (
                <div className="empty-admin-list">
                  <p>No saved products yet.</p>
                  <button
                    className="primary-button"
                    disabled={seedingProducts}
                    onClick={seedProducts}
                  >
                    {seedingProducts ? "Loading…" : "Load 20 demo products"}
                  </button>
                </div>
              )}
              <div className="status-filters product-filters">{["ALL", "ACTIVE", "HIDDEN"].map((status) => <button className={productFilter === status ? "active" : ""} key={status} onClick={() => { setProductFilter(status); setProductPage(1); }}>{status === "ALL" ? "All" : status === "ACTIVE" ? "Active" : "Hidden"}</button>)}</div>
              <p className="portal-hint">
                Excel columns: Name, SKU, Category, Description, Price,
                Specifications, Availability, ImageUrl, DatasheetUrl.
              </p>
              <AdminTable
                rows={visibleProducts}
                empty="No products match this search."
                columns={[
                  { key: "product", label: "Product", render: (product) => <button className="table-cell-button" onClick={() => editProduct(product)}><strong>{product.name}</strong><small>{product.summary}</small></button> },
                  { key: "sku", label: "SKU", render: (product) => <code>{product.sku}</code> },
                  { key: "category", label: "Category", render: (product) => product.category },
                  { key: "availability", label: "Availability", render: (product) => product.availability || "—" },
                  { key: "price", label: "Price", render: (product) => <strong>{Number(product.price) > 0 ? money(Number(product.price)) : "Price on request"}</strong> },
                  { key: "catalogue", label: "Catalogue", render: (product) => <em className={`status-chip ${product.is_active ? "accepted" : "hidden"}`}>{product.is_active ? "ACTIVE" : "HIDDEN"}</em> },
                  { key: "action", label: "Action", render: (product) => <button className="table-action" onClick={(event) => { event.stopPropagation(); editProduct(product); }}>Edit</button> },
                ]}
              />
              <AdminPagination page={productPage} pageCount={productPageCount} total={filteredProducts.length} pageSize={pageSize} onPageChange={setProductPage} />
            </article>
          </div>
        )}
        {section === "files" && (
          <article className="portal-card">
            <p className="kicker">Media & files</p>
            <h2>Product assets</h2>
            <p className="portal-hint">
              Select a product, then replace its photo or datasheet. Saving the
              product keeps the new file.
            </p>
            <div className="media-list">
              {products.map((product) => (
                <div className="media-row" key={product.id}>
                  {product.image_url ? (
                    <img src={product.image_url} alt="" />
                  ) : (
                    <span className="media-placeholder">No photo</span>
                  )}
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {product.sku} ·{" "}
                      {product.datasheet_path
                        ? "Datasheet attached"
                        : "No datasheet"}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      editProduct(product);
                      setSection("products");
                    }}
                  >
                    Manage
                  </button>
                </div>
              ))}
            </div>
          </article>
        )}
        {section === "settings" && (
          <article className="portal-card">
            <p className="kicker">Supplier profile</p>
            <h2>Company settings</h2>
            <form className="portal-form" onSubmit={saveSettings}>
              <label>
                Company name
                <input
                  required
                  value={settings.company_name}
                  onChange={(e) =>
                    setSettings({ ...settings, company_name: e.target.value })
                  }
                />
              </label>
              <label>
                Registration no.
                <input
                  value={settings.registration_number || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      registration_number: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={settings.email || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, email: e.target.value })
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={settings.phone || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, phone: e.target.value })
                  }
                />
              </label>
              <label>
                Quote validity (days)
                <input
                  min="1"
                  type="number"
                  value={settings.quotation_validity_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      quotation_validity_days: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                SST rate (%)
                <input
                  min="0"
                  type="number"
                  value={settings.sst_percent}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sst_percent: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="full">
                Address
                <textarea
                  rows={3}
                  value={settings.address || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                />
              </label>
              <label className="full">
                Payment terms
                <textarea
                  rows={2}
                  value={settings.payment_terms || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, payment_terms: e.target.value })
                  }
                />
              </label>
              <label>
                Company logo
                <span className="logo-upload">
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e, "logo")} />
                  {settings.logo_url ? <img src={settings.logo_url} alt="Company logo" /> : <span>Upload logo</span>}
                </span>
              </label>
              <div className="portal-actions full">
                <button disabled={savingSettings} className="primary-button">
                  {savingSettings ? "Saving…" : "Save settings"}
                </button>
              </div>
            </form>
          </article>
        )}
      </main>
    </section>
  );
}
