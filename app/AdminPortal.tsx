"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AdminModal, AdminPagination, AdminTable, AdminToolbar } from "./admin/AdminPrimitives";
import { CustomersSection } from "./admin/portal/CustomersSection";
import { DashboardSection } from "./admin/portal/DashboardSection";
import { money } from "./lib/format";
import { canViewSection, demoTierLabel, type DemoTier } from "./lib/demoTier";
import { PortalShell } from "./admin/portal/PortalShell";
import { blankProduct, quoteValues } from "./admin/portal/portal-utils";
import { TasksSection } from "./admin/portal/TasksSection";
import { useAdminApi } from "./admin/portal/useAdminApi";
import type {
  AiAction,
  AuditLog,
  CrmTask,
  CustomerAccount,
  CustomerDraft,
  CustomerPriceRule,
  IntegrationDelivery,
  InventoryMovement,
  InventoryReservation,
  KnowledgeDocument,
  Line,
  Product,
  Quote,
  Rfq,
  Section,
  Settings,
  StaffMember,
  StaffRole,
  TaskDraft,
} from "./admin/portal/types";

export function AdminPortal({
  token,
  role = "admin",
  demoTier,
  onSignOut,
  notify,
}: {
  token: string;
  role?: StaffRole;
  demoTier: DemoTier;
  onSignOut: () => void;
  notify: (message: string) => void;
}) {
  const [section, setSection] = useState<Section>("dashboard");
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [teamMembers, setTeamMembers] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<Product[]>([]);
  const [inventoryReservations, setInventoryReservations] = useState<InventoryReservation[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [integrationDeliveries, setIntegrationDeliveries] = useState<IntegrationDelivery[]>([]);
  const [aiActions, setAiActions] = useState<AiAction[]>([]);
  const [aiActionDraft, setAiActionDraft] = useState({ title: "", rfqId: "", dueAt: "" });
  const [savingAiAction, setSavingAiAction] = useState(false);
  const [inventoryDraft, setInventoryDraft] = useState({ mode: "adjust", productId: "", delta: "", quantity: "", reason: "receipt", reference: "", rfqId: "", expiresAt: "", reservationId: "" });
  const [savingInventory, setSavingInventory] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({ title: "", taskType: "follow_up", rfqId: "", accountId: "", assigneeId: "", dueAt: "", notes: "" });
  const [savingTask, setSavingTask] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState("ALL");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [priceRules, setPriceRules] = useState<CustomerPriceRule[]>([]);
  const [priceDraft, setPriceDraft] = useState({ customerEmail: "", productId: "", unitPrice: "" });
  const [savingPriceRule, setSavingPriceRule] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>({ id: "", companyName: "", contactName: "", email: "", phone: "", status: "active", notes: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
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
  const [quoteNotes, setQuoteNotes] = useState("");
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
  const [knowledgeDraft, setKnowledgeDraft] = useState({ title: "", sourceType: "policy", content: "", isPublic: false, file: null as File | null });
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState("ALL");
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeDocument | null>(null);
  const [loadingKnowledgeBody, setLoadingKnowledgeBody] = useState(false);
  const { accessToken, setAccessToken, authedFetch, readSection } = useAdminApi(token);
  const [loading, setLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState<string[]>([]);
  const canManageAdmin = role === "admin" || role === "owner";
  const canUsePremium = canViewSection(demoTier, "customers");
  const activeSection = canViewSection(demoTier, section) ? section : "dashboard";

  async function load() {
    setLoading(true);
    let bearer = accessToken;
    if (!bearer) {
      bearer = sessionStorage.getItem("supplierflow-admin-token") || "";
      setAccessToken(bearer);
    }
    const [dashboard, productList, teamResult, pricesResult, customersResult, tasksResult, inventoryResult] = await Promise.all([
      readSection(`/api/admin/dashboard?tier=${demoTier}`, "RFQs and quotations", bearer),
      readSection("/api/admin/products", "Products", bearer),
      canUsePremium && canManageAdmin ? readSection("/api/admin/team", "Team", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/prices", "Customer pricing", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/customers", "Customer accounts", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/tasks", "CRM tasks", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/inventory", "Inventory", bearer) : Promise.resolve(null),
    ]);
    if (teamResult?.ok) setTeamMembers(Array.isArray(teamResult.data.members) ? teamResult.data.members : []);
    if (pricesResult?.ok) setPriceRules(Array.isArray(pricesResult.data.rules) ? pricesResult.data.rules : []);
    if (customersResult?.ok) setCustomers(Array.isArray(customersResult.data.accounts) ? customersResult.data.accounts : []);
    if (tasksResult?.ok) setTasks(Array.isArray(tasksResult.data.tasks) ? tasksResult.data.tasks : []);
    if (inventoryResult?.ok) {
      setInventoryProducts(Array.isArray(inventoryResult.data.products) ? inventoryResult.data.products : []);
      setInventoryReservations(Array.isArray(inventoryResult.data.reservations) ? inventoryResult.data.reservations : []);
      setInventoryMovements(Array.isArray(inventoryResult.data.movements) ? inventoryResult.data.movements : []);
    }

    const adminResults = canManageAdmin ? await Promise.all([
      readSection("/api/admin/settings", "Company settings", bearer),
      canUsePremium ? readSection("/api/admin/knowledge", "Knowledge base", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/audit", "Audit trail", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/integrations", "Integrations", bearer) : Promise.resolve(null),
      canUsePremium ? readSection("/api/admin/ai-actions", "AI action queue", bearer) : Promise.resolve(null),
    ]) : [];
    const [settingsResult, knowledgeResult, auditResult, integrationsResult, aiActionsResult] = adminResults;

    if (dashboard.ok) {
      setRfqs(Array.isArray(dashboard.data.rfqs) ? dashboard.data.rfqs : []);
      setQuotes(Array.isArray(dashboard.data.quotations) ? dashboard.data.quotations : []);
    }
    if (productList.ok) setProducts(Array.isArray(productList.data.products) ? productList.data.products : []);
    if (settingsResult?.ok && settingsResult.data.settings) setSettings(settingsResult.data.settings);
    if (knowledgeResult?.ok) setKnowledge(Array.isArray(knowledgeResult.data.documents) ? knowledgeResult.data.documents : []);
    if (auditResult?.ok) setAuditLogs(Array.isArray(auditResult.data.logs) ? auditResult.data.logs : []);
    if (integrationsResult?.ok) setIntegrationDeliveries(Array.isArray(integrationsResult.data.deliveries) ? integrationsResult.data.deliveries : []);
    if (aiActionsResult?.ok) setAiActions(Array.isArray(aiActionsResult.data.actions) ? aiActionsResult.data.actions : []);

    const results = [dashboard, productList, teamResult, pricesResult, customersResult, tasksResult, inventoryResult, ...(canManageAdmin ? adminResults : [])].filter((result): result is NonNullable<typeof result> => result !== null);
    const failed = results.filter((result) => !result.ok);
    setLoadFailures(failed.map((result) => result.label));
    setLoading(false);

    if (!failed.length) {
      setNotice("");
      return;
    }
    // An expired session fails every section at once and is fixed by signing in, not by migrating.
    if (failed.every((result) => result.status === 401)) {
      setNotice("Your session expired. Please sign in again.");
      notify("Session expired. Please sign in again.");
      return;
    }
    const message = `Could not load: ${failed.map((result) => result.label).join(", ")}. ${failed[0].reason}`;
    setNotice(message);
    notify(`Could not load ${failed.length} admin section${failed.length === 1 ? "" : "s"}.`);
  }
  // Initial portal load only; subsequent loads are triggered by completed mutations or Retry.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const closeModal = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedRfq(null);
      setSelectedQuote(null);
      setProductModalOpen(false);
      setCustomerModalOpen(false);
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
          quoteValues(
            quote.quotation_items,
            quote.discount_percent,
            quote.tax_percent,
            quote.delivery_fee,
          ).total,
        0,
      ),
    [quotes],
  );
  const current = quoteValues(
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
  const filteredCustomers = customers.filter((account) => {
    const query = customerSearch.trim().toLowerCase();
    return !query || [account.company_name, account.primary_contact_name, account.primary_email, account.phone].some((value) => String(value || "").toLowerCase().includes(query));
  });
  const filteredTasks = tasks.filter((task) => {
    const query = taskSearch.trim().toLowerCase();
    return (taskFilter === "ALL" || task.status === taskFilter) && (!query || [task.title, task.task_type, task.status, task.rfqs?.reference, task.rfqs?.company_name, task.customer_accounts?.company_name].some((value) => String(value || "").toLowerCase().includes(query)));
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
          priceRules.find((rule) => rule.product_id === item.product_id && rfq.account_id && rule.account_id === rfq.account_id)?.unit_price ??
          priceRules.find((rule) => rule.product_id === item.product_id && rule.customer_email === rfq.email.toLowerCase())?.unit_price ??
          products.find((product) => product.id === item.product_id)?.price ??
          0,
        ),
      })),
    );
    setDiscount(0);
    setTax(Number(settings.sst_percent));
    setDelivery(0);
    setQuoteNotes("");
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
      stockQuantity: product.stock_quantity === null || product.stock_quantity === undefined ? "" : String(product.stock_quantity),
      imageClass: product.image_type || "accessory",
      imageUrl: product.image_url || "",
      datasheetPath: product.datasheet_path || "",
      price: String(product.price || ""),
      isActive: product.is_active,
    });
    setProductModalOpen(true);
  }
  function editCustomer(account: CustomerAccount) {
    setCustomerDraft({
      id: account.id,
      companyName: account.company_name,
      contactName: account.primary_contact_name,
      email: account.primary_email,
      phone: account.phone || "",
      status: account.status,
      notes: account.notes || "",
    });
    setCustomerModalOpen(true);
  }
  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCustomer) return;
    setSavingCustomer(true);
    const response = await authedFetch("/api/admin/customers", {
      method: customerDraft.id ? "PATCH" : "POST",
      body: JSON.stringify(customerDraft),
    });
    const data = await response.json().catch(() => ({}));
    setSavingCustomer(false);
    if (!response.ok) {
      notify(data.error || "Customer account could not be saved.");
      return;
    }
    setCustomerDraft({ id: "", companyName: "", contactName: "", email: "", phone: "", status: "active", notes: "" });
    setCustomerModalOpen(false);
    notify("Customer account saved.");
    await load();
  }
  async function saveTeamRole(id: string, nextRole: StaffRole) {
    const response = await authedFetch("/api/admin/team", { method: "PATCH", body: JSON.stringify({ id, role: nextRole }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { notify(data.error || "Staff role could not be saved."); return; }
    setTeamMembers((current) => current.map((member) => member.id === id ? { ...member, role: nextRole } : member));
    notify("Staff role saved.");
  }
  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingTask) return;
    setSavingTask(true);
    const response = await authedFetch("/api/admin/tasks", { method: "POST", body: JSON.stringify({ ...taskDraft, dueAt: taskDraft.dueAt ? new Date(taskDraft.dueAt).toISOString() : null }) });
    const data = await response.json().catch(() => ({}));
    setSavingTask(false);
    if (!response.ok) { notify(data.error || "Task could not be created."); return; }
    setTaskDraft({ title: "", taskType: "follow_up", rfqId: "", accountId: "", assigneeId: "", dueAt: "", notes: "" });
    notify("Task created.");
    await load();
  }
  async function updateTaskStatus(task: CrmTask, status: CrmTask["status"]) {
    const response = await authedFetch("/api/admin/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, rfqId: task.rfq_id, accountId: task.account_id, assigneeId: task.assignee_id, title: task.title, taskType: task.task_type, dueAt: task.due_at, status, notes: task.notes }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { notify(data.error || "Task could not be updated."); return; }
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status, completed_at: status === "completed" ? new Date().toISOString() : null } : item));
    notify(status === "completed" ? "Task completed." : "Task updated.");
  }
  async function saveInventoryAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingInventory) return;
    setSavingInventory(true);
    const body = inventoryDraft.mode === "adjust"
      ? { ...inventoryDraft, delta: Number(inventoryDraft.delta) }
      : inventoryDraft.mode === "reserve"
        ? { ...inventoryDraft, quantity: Number(inventoryDraft.quantity), expiresAt: inventoryDraft.expiresAt ? new Date(inventoryDraft.expiresAt).toISOString() : null }
        : inventoryDraft;
    const response = await authedFetch("/api/admin/inventory", { method: "POST", body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    setSavingInventory(false);
    if (!response.ok) { notify(data.error || "Inventory action could not be completed."); return; }
    setInventoryDraft({ mode: inventoryDraft.mode, productId: "", delta: "", quantity: "", reason: "receipt", reference: "", rfqId: "", expiresAt: "", reservationId: "" });
    notify(inventoryDraft.mode === "adjust" ? "Inventory updated." : inventoryDraft.mode === "reserve" ? "Stock reserved." : "Reservation released.");
    await load();
  }
  async function retryDelivery(id: string) {
    const response = await authedFetch("/api/admin/integrations", { method: "POST", body: JSON.stringify({ id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { notify(data.error || "Integration delivery failed."); return; }
    notify("Integration delivery retried.");
    await load();
  }
  async function proposeAiAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAiAction) return;
    setSavingAiAction(true);
    const response = await authedFetch("/api/admin/ai-actions", { method: "POST", body: JSON.stringify({ actionType: "create_follow_up_task", rfqId: aiActionDraft.rfqId || null, title: aiActionDraft.title, dueAt: aiActionDraft.dueAt ? new Date(aiActionDraft.dueAt).toISOString() : null }) });
    const data = await response.json().catch(() => ({}));
    setSavingAiAction(false);
    if (!response.ok) { notify(data.error || "AI action could not be proposed."); return; }
    setAiActionDraft({ title: "", rfqId: "", dueAt: "" });
    notify("AI action proposed for approval.");
    await load();
  }
  async function decideAiAction(id: string, status: "approved" | "rejected") {
    const response = await authedFetch("/api/admin/ai-actions", { method: "PATCH", body: JSON.stringify({ id, status }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { notify(data.error || "AI action could not be processed."); return; }
    notify(status === "approved" ? "AI action approved and executed." : "AI action rejected.");
    await load();
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProduct(true);
    setNotice("");
    notify("Saving product…");
    const response = await authedFetch("/api/admin/products", {
      method: productDraft.id ? "PATCH" : "POST",
      body: JSON.stringify({
        ...productDraft,
        price: Number(productDraft.price),
        stockQuantity: productDraft.stockQuantity,
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
  async function savePriceRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPriceRule) return;
    setSavingPriceRule(true);
    const response = await authedFetch("/api/admin/prices", { method: "POST", body: JSON.stringify({ ...priceDraft, unitPrice: Number(priceDraft.unitPrice) }) });
    const data = await response.json().catch(() => ({}));
    setSavingPriceRule(false);
    if (!response.ok) { notify(data.error || "Customer price could not be saved."); return; }
    setPriceDraft({ customerEmail: "", productId: "", unitPrice: "" });
    notify("Customer price saved.");
    await load();
  }
  async function deletePriceRule(id: string) {
    const response = await authedFetch(`/api/admin/prices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { notify("Customer price could not be removed."); return; }
    setPriceRules((current) => current.filter((rule) => rule.id !== id));
    notify("Customer price removed.");
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
    const response = await authedFetch("/api/admin/uploads", {
      method: "POST",
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
      const settingsResponse = await authedFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify(next) });
      if (!settingsResponse.ok) {
        setNotice("Logo uploaded, but company settings could not be saved.");
        notify("Logo could not be saved.");
        return;
      }
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
      const response = await authedFetch("/api/admin/products", {
        method: "POST",
        body: JSON.stringify({
          name,
          sku,
          category,
          summary,
          price: Number(row.Price || row.price || 0),
          stockQuantity: row.StockQuantity === "" || row.StockQuantity === undefined ? null : Number(row.StockQuantity),
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
    notify("Restoring official catalogue…");
    const response = await authedFetch("/api/admin/products/seed", {
      method: "POST",
    });
    const data = await response.json();
    setSeedingProducts(false);
    if (!response.ok) {
      setNotice("Official catalogue could not be loaded.");
      notify("Official catalogue could not be loaded.");
      return;
    }
    setNotice(`${data.restored} official products restored; previous demo products hidden.`);
    notify(`${data.restored} official products restored; previous demo products hidden.`);
    await load();
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);
    notify("Saving company settings…");
    const response = await authedFetch("/api/admin/settings", {
      method: "PUT",
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
    const response = await authedFetch("/api/admin/quotations", {
      method: "POST",
      body: JSON.stringify({
        rfqId: selectedRfq.id,
        reference: `Q-${selectedRfq.reference.replace("RFQ-", "")}-R${revision}`,
        revision,
        companyName: settings.company_name,
        discountPercent: discount,
        taxPercent: tax,
        deliveryFee: delivery,
        validityDays: settings.quotation_validity_days,
        paymentTerms: settings.payment_terms,
        notes: quoteNotes.trim(),
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
    const response = await authedFetch("/api/admin/rfqs", { method: "PATCH", body: JSON.stringify({ id: selectedRfq.id, status }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("RFQ status could not be updated."); return; }
    setSelectedRfq({ ...selectedRfq, status }); notify(`RFQ marked ${status}.`); await load();
  }
  async function assignRfq(assignedTo: string) {
    if (!selectedRfq || updatingStatus) return;
    setUpdatingStatus(true);
    const response = await authedFetch("/api/admin/rfqs", { method: "PATCH", body: JSON.stringify({ id: selectedRfq.id, assignedTo: assignedTo || null }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("RFQ assignment could not be updated."); return; }
    const next = assignedTo || null;
    setSelectedRfq({ ...selectedRfq, assigned_to: next });
    setRfqs((current) => current.map((rfq) => rfq.id === selectedRfq.id ? { ...rfq, assigned_to: next } : rfq));
    notify(next ? "RFQ assigned." : "RFQ unassigned.");
  }
  async function updateRfqFollowUp(followUpDate: string) {
    if (!selectedRfq || updatingStatus) return;
    setUpdatingStatus(true);
    const response = await authedFetch("/api/admin/rfqs", { method: "PATCH", body: JSON.stringify({ id: selectedRfq.id, followUpDate: followUpDate || null }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("Follow-up date could not be saved."); return; }
    const next = followUpDate || null;
    setSelectedRfq({ ...selectedRfq, follow_up_date: next });
    setRfqs((current) => current.map((rfq) => rfq.id === selectedRfq.id ? { ...rfq, follow_up_date: next } : rfq));
    notify(next ? "Follow-up reminder saved." : "Follow-up reminder cleared.");
  }
  async function addActivityNote() {
    if (!selectedRfq || !activityNote.trim() || updatingStatus) return;
    setUpdatingStatus(true); notify("Saving RFQ note…");
    const response = await authedFetch("/api/admin/rfqs", { method: "PATCH", body: JSON.stringify({ id: selectedRfq.id, note: activityNote }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("RFQ note could not be saved."); return; }
    setActivityNote(""); notify("RFQ note saved."); await load();
  }
  async function saveKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingKnowledge) return;
    setSavingKnowledge(true);
    setKnowledgeError("");
    notify("Processing knowledge document…");
    try {
      // Send the id when editing so the server replaces the document instead of inserting a
      // duplicate, which would leave two copies of the same text in the retrieval index.
      const id = selectedKnowledge?.id;
      const body = knowledgeDraft.file
        ? (() => {
            const form = new FormData();
            if (id) form.append("id", id);
            form.append("title", knowledgeDraft.title);
            form.append("sourceType", knowledgeDraft.sourceType);
            form.append("isPublic", String(knowledgeDraft.isPublic));
            form.append("file", knowledgeDraft.file);
            return form;
          })()
        : JSON.stringify({ id, title: knowledgeDraft.title, sourceType: knowledgeDraft.sourceType, content: knowledgeDraft.content, isPublic: knowledgeDraft.isPublic });
      const response = await authedFetch("/api/admin/knowledge", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Knowledge document could not be saved.");
      setKnowledgeDraft({ title: "", sourceType: "policy", content: "", isPublic: false, file: null });
      setSelectedKnowledge(null);
      setKnowledgeModalOpen(false);
      notify(data.embedded ? `Knowledge saved and vector-indexed in ${data.chunks} chunks.` : "Knowledge saved. Keyword retrieval is active.");
      await load();
    } catch (error) {
      const message = error instanceof Error && error.message === "Failed to fetch"
        ? "The server connection was lost while indexing. Restart the dev server and try again."
        : error instanceof Error ? error.message : "Knowledge document could not be saved.";
      setKnowledgeError(message);
      setNotice(message);
      notify(message);
    } finally {
      setSavingKnowledge(false);
    }
  }
  async function openKnowledge(document: KnowledgeDocument) {
    setSelectedKnowledge(document);
    // The list endpoint omits `content` to keep the table payload small, so the body has to be
    // fetched here. Open immediately with a loading placeholder rather than blocking the click.
    setKnowledgeDraft({ title: document.title, sourceType: document.source_type, content: "", isPublic: document.is_public !== false, file: null });
    setKnowledgeModalOpen(true);
    setLoadingKnowledgeBody(true);
    try {
      const response = await authedFetch(`/api/admin/knowledge?id=${encodeURIComponent(document.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Document could not be loaded.");
      setSelectedKnowledge(data.document);
      setKnowledgeDraft({ title: data.document.title, sourceType: data.document.source_type, content: data.document.content || "", isPublic: data.document.is_public !== false, file: null });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Document could not be loaded.");
    } finally {
      setLoadingKnowledgeBody(false);
    }
  }
  function newKnowledge() {
    setSelectedKnowledge(null);
    setKnowledgeError("");
    setKnowledgeDraft({ title: "", sourceType: "policy", content: "", isPublic: false, file: null });
    setKnowledgeModalOpen(true);
  }
  async function updateQuoteApproval(approvalStatus: "approved" | "rejected") {
    if (!selectedQuote || updatingStatus) return;
    setUpdatingStatus(true);
    const response = await authedFetch("/api/admin/quotations", { method: "PATCH", body: JSON.stringify({ id: selectedQuote.id, rfqId: selectedQuote.rfq_id, approvalStatus }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("Quotation approval could not be updated."); return; }
    setSelectedQuote({ ...selectedQuote, approval_status: approvalStatus });
    notify(approvalStatus === "approved" ? "Quotation approved." : "Quotation draft rejected.");
    await load();
  }
  async function updateQuoteStatus(status: string, approvalStatus?: "approved" | "rejected") {
    if (!selectedQuote || updatingStatus) return;
    setUpdatingStatus(true); notify(`Marking quotation ${status.toLowerCase()}…`);
    const response = await authedFetch("/api/admin/quotations", { method: "PATCH", body: JSON.stringify({ id: selectedQuote.id, rfqId: selectedQuote.rfq_id, status, approvalStatus }) });
    setUpdatingStatus(false);
    if (!response.ok) { notify("Quotation status could not be updated."); return; }
    setSelectedQuote({ ...selectedQuote, status, approval_status: approvalStatus || selectedQuote.approval_status }); notify(`Quotation marked ${status}.`); await load();
  }
  function print(quote: Quote) {
    const data = quoteValues(
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
    quoteValues(
      selectedQuote.quotation_items,
      selectedQuote.discount_percent,
      selectedQuote.tax_percent,
      selectedQuote.delivery_fee,
    );

  return (
    <PortalShell
      section={activeSection}
      role={role}
      demoTier={demoTier}
      demoTierLabel={demoTierLabel[demoTier]}
      settings={settings}
      canManageAdmin={canManageAdmin}
      notice={notice}
      loadFailures={loadFailures}
      loading={loading}
      onSectionChange={setSection}
      onSignOut={onSignOut}
      onRetry={() => void load()}
      onDismissNotice={() => setNotice("")}
    >
        {activeSection === "dashboard" && <DashboardSection
          rfqs={rfqs}
          quotes={quotes}
          products={products}
          quoteValue={quoteValue}
          onOpenRfq={(rfq) => { openRfq(rfq); setSection("rfqs"); }}
        />}
        {activeSection === "knowledge" && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="RAG knowledge" title={`${filteredKnowledge.length} documents`} searchLabel="Search knowledge" search={knowledgeSearch} onSearch={(value) => { setKnowledgeSearch(value); setKnowledgePage(1); }} placeholder="Title or document type..." actions={<button className="primary-button" onClick={newKnowledge}>Add document</button>} />
            <div className="status-filters">{["ALL", "POLICY", "FAQ", "SOP", "DATASHEET"].map((status) => <button className={knowledgeFilter === status ? "active" : ""} key={status} onClick={() => { setKnowledgeFilter(status); setKnowledgePage(1); }}>{status === "ALL" ? "All" : status}</button>)}</div>
            <AdminTable rows={visibleKnowledge} empty="No knowledge documents match this search." columns={[
              { key: "title", label: "Document", render: (document) => <button className="table-cell-button" onClick={() => openKnowledge(document)}><strong>{document.title}</strong><small>{document.source_type.toUpperCase()}</small></button> },
              { key: "type", label: "Type", align: "center", render: (document) => <em className="status-chip sent">{document.source_type.toUpperCase()}</em> },
              { key: "visibility", label: "Audience", align: "center", render: (document) => document.is_public ? "Customer AI" : "Internal" },
              { key: "chunks", label: "Chunks", align: "right", render: (document) => `${document.knowledge_chunks?.[0]?.count || 0} indexed` },
              { key: "created", label: "Created", render: (document) => document.created_at ? new Date(document.created_at).toLocaleDateString("en-MY") : "—" },
              { key: "action", label: "Action", align: "right", render: (document) => <button className="table-action" onClick={() => openKnowledge(document)}>View</button> },
            ]} />
            <AdminPagination page={knowledgePage} pageCount={knowledgePageCount} total={filteredKnowledge.length} pageSize={pageSize} onPageChange={setKnowledgePage} />
            {knowledgeModalOpen && <AdminModal titleId="knowledge-modal-title" label="Close knowledge editor" onClose={() => setKnowledgeModalOpen(false)} className="knowledge-editor-modal">
              <p className="kicker">{selectedKnowledge ? "Knowledge document" : "New knowledge"}</p>
              <h2 id="knowledge-modal-title">{selectedKnowledge ? selectedKnowledge.title : "Add company knowledge"}</h2>
              <p className="portal-hint">{selectedKnowledge ? `${selectedKnowledge.source_type.toUpperCase()} · ${selectedKnowledge.knowledge_chunks?.[0]?.count || 0} chunk(s) indexed. Saving re-indexes this document and replaces the existing version.` : "Add FAQ, delivery policy, warranty terms, or sales SOP. Text is split into chunks for retrieval."}</p>
              <form className="copilot-form" onSubmit={saveKnowledge}>
                <label>Document title<input required value={knowledgeDraft.title} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, title: event.target.value })} placeholder="Delivery policy" /></label>
                <label>Document type<select value={knowledgeDraft.sourceType} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, sourceType: event.target.value })}><option value="policy">Policy</option><option value="faq">FAQ</option><option value="sop">Sales SOP</option><option value="datasheet">Datasheet notes</option></select></label>
                <label className="knowledge-file-field">Knowledge PDF <small>Optional · max 10 MB · selectable text only</small><span className="file-picker"><span>{knowledgeDraft.file ? knowledgeDraft.file.name : "Choose PDF"}</span><input type="file" accept="application/pdf" onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, file: event.target.files?.[0] || null, content: "" })} /></span></label>
                <label className="knowledge-visibility"><input type="checkbox" checked={knowledgeDraft.isPublic} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, isPublic: event.target.checked })} /><span>Visible to customer SupplyAI</span></label>
                <label className="knowledge-text-field">Knowledge text<textarea required={!knowledgeDraft.file} rows={11} value={loadingKnowledgeBody ? "Loading document…" : knowledgeDraft.file ? "PDF text will be extracted when saved." : knowledgeDraft.content} readOnly={loadingKnowledgeBody || Boolean(knowledgeDraft.file)} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, content: event.target.value })} placeholder="Klang Valley deliveries take 1–2 working days..." /></label>
                {knowledgeError && <p className="form-error knowledge-error" role="alert">{knowledgeError}</p>}
                <button className="primary-button" disabled={savingKnowledge || loadingKnowledgeBody}>{savingKnowledge ? "Indexing…" : loadingKnowledgeBody ? "Loading…" : selectedKnowledge ? "Re-index this document" : "Save to knowledge base"}</button>
              </form>
            </AdminModal>}
          </div>
        )}
        {activeSection === "rfqs" && (
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
                { key: "status", label: "Status", align: "center", render: (rfq) => <><em className={`status-chip ${rfq.status.toLowerCase()}`}>{rfq.status}</em>{rfq.follow_up_date && <small>Follow up {rfq.follow_up_date}</small>}</> },
                { key: "action", label: "Action", align: "right", render: (rfq) => <button className="table-action" onClick={(event) => { event.stopPropagation(); openRfq(rfq); }}>View</button> },
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
                  <label className="rfq-assignment">
                    Assigned to
                    <select value={selectedRfq.assigned_to || ""} disabled={updatingStatus} onChange={(event) => void assignRfq(event.target.value)}>
                      <option value="">Unassigned</option>
                      {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.email} · {member.role}</option>)}
                    </select>
                  </label>
                  <label className="rfq-assignment">
                    Follow-up reminder
                    <input type="date" value={selectedRfq.follow_up_date || ""} disabled={updatingStatus} onChange={(event) => void updateRfqFollowUp(event.target.value)} />
                  </label>
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
                            <small>{line.sku}{(() => { const stock = products.find((product) => product.id === line.product_id)?.stock_quantity; return stock === null || stock === undefined ? "" : ` · ${stock} tracked`; })()}</small>
                            {(() => { const stock = products.find((product) => product.id === line.product_id)?.stock_quantity; return stock !== null && stock !== undefined && line.quantity > stock ? <small className="stock-warning">Requested quantity exceeds tracked stock.</small> : null; })()}
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
                      <label className="quote-message-field">
                        Message to customer
                        <textarea
                          rows={3}
                          value={quoteNotes}
                          onChange={(e) => setQuoteNotes(e.target.value)}
                          placeholder="Add a short note about the quote, lead time, or next steps"
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
                    {canManageAdmin ? <button
                      disabled={savingQuote}
                      className="primary-button"
                      onClick={() => saveQuote(true)}
                    >
                      {savingQuote ? "Sending…" : "Send quotation"}
                    </button> : <span className="portal-hint">Saved drafts require admin approval before sending.</span>}
                  </div>
                </>
              ) : (
                <p>Select an RFQ.</p>
              )}
            </AdminModal>}
          </div>
        )}
        {activeSection === "tasks" && <TasksSection
          tasks={filteredTasks}
          search={taskSearch}
          filter={taskFilter}
          draft={taskDraft}
          teamMembers={teamMembers}
          rfqs={rfqs}
          saving={savingTask}
          onSearch={setTaskSearch}
          onFilter={setTaskFilter}
          onDraftChange={setTaskDraft}
          onSave={saveTask}
          onUpdateStatus={(task, status) => void updateTaskStatus(task, status)}
        />}
        {activeSection === "quotations" && (
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
                  { key: "total", label: "Total", align: "right", render: (quote) => <strong>{money(quoteValues(quote.quotation_items, quote.discount_percent, quote.tax_percent, quote.delivery_fee).total)}</strong> },
                  { key: "approval", label: "Approval", align: "center", render: (quote) => <em className={`status-chip ${quote.approval_status === "approved" ? "accepted" : quote.approval_status === "rejected" ? "rejected" : "reviewing"}`}>{quote.approval_status || "pending"}</em> },
                  { key: "status", label: "Status", align: "center", render: (quote) => <em className={`status-chip ${quote.status.toLowerCase()}`}>{quote.status}</em> },
                  { key: "action", label: "Action", align: "right", render: (quote) => <button className="table-action" onClick={(event) => { event.stopPropagation(); setSelectedQuote(quote); }}>View</button> },
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
                  {selectedQuote.notes && (
                    <div className="saved-quote-note">
                      <p className="kicker">Message to customer</p>
                      <p>{selectedQuote.notes}</p>
                    </div>
                  )}
                  <div className="portal-actions">
                    <button onClick={() => print(selectedQuote)}>
                      Print / PDF
                    </button>
                    {selectedQuote.status === "DRAFT" && canManageAdmin && <button disabled={updatingStatus} className="primary-button" onClick={() => updateQuoteStatus("SENT", "approved")}>{selectedQuote.approval_status === "pending" ? "Approve & send" : "Mark sent"}</button>}
                    {selectedQuote.status === "DRAFT" && canManageAdmin && selectedQuote.approval_status !== "rejected" && <button disabled={updatingStatus} className="reject-action" onClick={() => updateQuoteApproval("rejected")}>Reject draft</button>}
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
        {activeSection === "customers" && <CustomersSection
          accounts={filteredCustomers}
          search={customerSearch}
          draft={customerDraft}
          modalOpen={customerModalOpen}
          saving={savingCustomer}
          onSearch={setCustomerSearch}
          onDraftChange={setCustomerDraft}
          onSave={saveCustomer}
          onClose={() => setCustomerModalOpen(false)}
          onAdd={() => { setCustomerDraft({ id: "", companyName: "", contactName: "", email: "", phone: "", status: "active", notes: "" }); setCustomerModalOpen(true); }}
          onEdit={editCustomer}
        />}
        {activeSection === "products" && (
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
                  Tracked stock quantity <small>Leave blank if not tracked</small>
                  <input
                    min="0"
                    type="number"
                    value={productDraft.stockQuantity}
                    onChange={(e) => setProductDraft({ ...productDraft, stockQuantity: e.target.value })}
                  />
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
                <button className="outline-button" disabled={seedingProducts} onClick={seedProducts}>{seedingProducts ? "Restoring…" : "Restore official catalogue"}</button>
              </>} />
              {products.length === 0 && (
                <div className="empty-admin-list">
                  <p>No saved products yet.</p>
                  <button
                    className="primary-button"
                    disabled={seedingProducts}
                    onClick={seedProducts}
                  >
                    {seedingProducts ? "Restoring…" : "Restore official catalogue"}
                  </button>
                </div>
              )}
              <div className="status-filters product-filters">{["ALL", "ACTIVE", "HIDDEN"].map((status) => <button className={productFilter === status ? "active" : ""} key={status} onClick={() => { setProductFilter(status); setProductPage(1); }}>{status === "ALL" ? "All" : status === "ACTIVE" ? "Active" : "Hidden"}</button>)}</div>
              <p className="portal-hint">
                Excel columns: Name, SKU, Category, Description, Price,
                Specifications, Availability, StockQuantity, ImageUrl, DatasheetUrl.
              </p>
              <AdminTable
                rows={visibleProducts}
                empty="No products match this search."
                columns={[
                  { key: "product", label: "Product", render: (product) => <button className="table-cell-button" onClick={() => editProduct(product)}><strong>{product.name}</strong><small>{product.summary}</small></button> },
                  { key: "sku", label: "SKU", render: (product) => <code>{product.sku}</code> },
                  { key: "category", label: "Category", render: (product) => product.category },
                  { key: "availability", label: "Availability", render: (product) => <><strong>{product.availability || "—"}</strong><small>{product.stock_quantity === null || product.stock_quantity === undefined ? "Quantity not tracked" : `${product.stock_quantity} units tracked`}</small></> },
                  { key: "price", label: "Price", align: "right", render: (product) => <strong>{Number(product.price) > 0 ? money(Number(product.price)) : "Price on request"}</strong> },
                  { key: "catalogue", label: "Catalogue", align: "center", render: (product) => <em className={`status-chip ${product.is_active ? "accepted" : "hidden"}`}>{product.is_active ? "ACTIVE" : "HIDDEN"}</em> },
                  { key: "action", label: "Action", align: "right", render: (product) => <button className="table-action" onClick={(event) => { event.stopPropagation(); editProduct(product); }}>Edit</button> },
                ]}
              />
              <AdminPagination page={productPage} pageCount={productPageCount} total={filteredProducts.length} pageSize={pageSize} onPageChange={setProductPage} />
            </article>
            {canManageAdmin && canUsePremium && <article className="portal-card customer-pricing-card">
              <div className="portal-card-heading">
                <div><p className="kicker">Account pricing</p><h2>Customer price overrides</h2></div>
                <span className="portal-hint">Overrides match the customer account primary email.</span>
              </div>
              <form className="portal-form customer-pricing-form" onSubmit={savePriceRule}>
                <label>Customer email<input required type="email" value={priceDraft.customerEmail} onChange={(event) => setPriceDraft({ ...priceDraft, customerEmail: event.target.value })} placeholder="buyer@company.com" /></label>
                <label>Product<select required value={priceDraft.productId} onChange={(event) => setPriceDraft({ ...priceDraft, productId: event.target.value })}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
                <label>Unit price (RM)<input required min="0" step="0.01" type="number" value={priceDraft.unitPrice} onChange={(event) => setPriceDraft({ ...priceDraft, unitPrice: event.target.value })} /></label>
                <button className="primary-button" disabled={savingPriceRule}>{savingPriceRule ? "Saving…" : "Save override"}</button>
              </form>
              <AdminTable rows={priceRules} empty="No customer-specific prices yet." columns={[
                { key: "customer", label: "Customer", render: (rule) => <><strong>{rule.customer_accounts?.company_name || rule.customer_email}</strong><small>{rule.customer_accounts?.primary_email || rule.customer_email}</small></> },
                { key: "product", label: "Product", render: (rule) => <><strong>{rule.products?.name || rule.product_id}</strong><small>{rule.products?.sku || ""}</small></> },
                { key: "price", label: "Unit price", align: "right", render: (rule) => <strong>{money(Number(rule.unit_price))}</strong> },
                { key: "action", label: "Action", align: "right", render: (rule) => <button className="table-action" onClick={() => void deletePriceRule(rule.id)}>Remove</button> },
              ]} />
            </article>}
          </div>
        )}
        {activeSection === "inventory" && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="Stock control" title="Inventory ledger" searchLabel="Inventory" search="" onSearch={() => undefined} placeholder="Adjust stock or reserve for an RFQ" />
            <form className="portal-form customer-pricing-form" onSubmit={saveInventoryAction}>
              <label>Action<select value={inventoryDraft.mode} onChange={(event) => setInventoryDraft({ ...inventoryDraft, mode: event.target.value })}><option value="adjust">Adjust stock</option><option value="reserve">Reserve stock</option><option value="release">Release reservation</option></select></label>
              <label>Product<select required value={inventoryDraft.productId} onChange={(event) => setInventoryDraft({ ...inventoryDraft, productId: event.target.value })}><option value="">Select product</option>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
              {inventoryDraft.mode === "adjust" && <><label>Quantity change<input required type="number" step="1" value={inventoryDraft.delta} onChange={(event) => setInventoryDraft({ ...inventoryDraft, delta: event.target.value })} placeholder="+50 or -5" /></label><label>Reason<select value={inventoryDraft.reason} onChange={(event) => setInventoryDraft({ ...inventoryDraft, reason: event.target.value })}><option value="receipt">Receipt</option><option value="adjustment">Adjustment</option><option value="sale">Sale</option><option value="correction">Correction</option></select></label><label>Reference<input value={inventoryDraft.reference} onChange={(event) => setInventoryDraft({ ...inventoryDraft, reference: event.target.value })} placeholder="PO-1001" /></label></>}
              {inventoryDraft.mode === "reserve" && <><label>Quantity<input required type="number" min="1" step="1" value={inventoryDraft.quantity} onChange={(event) => setInventoryDraft({ ...inventoryDraft, quantity: event.target.value })} /></label><label>RFQ<select value={inventoryDraft.rfqId} onChange={(event) => setInventoryDraft({ ...inventoryDraft, rfqId: event.target.value })}><option value="">No linked RFQ</option>{rfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfq.reference} · {rfq.company_name}</option>)}</select></label><label>Expires<input type="datetime-local" value={inventoryDraft.expiresAt} onChange={(event) => setInventoryDraft({ ...inventoryDraft, expiresAt: event.target.value })} /></label></>}
              {inventoryDraft.mode === "release" && <label>Reservation<select required value={inventoryDraft.reservationId} onChange={(event) => { const reservation = inventoryReservations.find((item) => item.id === event.target.value); setInventoryDraft({ ...inventoryDraft, reservationId: event.target.value, productId: reservation?.product_id || inventoryDraft.productId }); }}><option value="">Select reservation</option>{inventoryReservations.filter((reservation) => reservation.status === "reserved").map((reservation) => <option key={reservation.id} value={reservation.id}>{reservation.id.slice(0, 8)} · {reservation.quantity} units</option>)}</select></label>}
              <div className="portal-actions full"><button className="primary-button" disabled={savingInventory}>{savingInventory ? "Saving…" : "Apply inventory action"}</button></div>
            </form>
            <p className="portal-hint">Available stock = on-hand quantity − active reservations. Every adjustment is recorded with its actor and reference.</p>
            <AdminTable rows={inventoryProducts} empty="No inventory products found." columns={[
              { key: "product", label: "Product", render: (product) => <><strong>{product.name}</strong><small>{product.sku}</small></> },
              { key: "onHand", label: "On hand", align: "right", render: (product) => product.stock_quantity === null || product.stock_quantity === undefined ? "Not tracked" : product.stock_quantity },
              { key: "reserved", label: "Reserved", align: "right", render: (product) => inventoryReservations.filter((reservation) => reservation.product_id === product.id && reservation.status === "reserved").reduce((sum, reservation) => sum + Number(reservation.quantity), 0) },
              { key: "available", label: "Available", align: "right", render: (product) => { const reserved = inventoryReservations.filter((reservation) => reservation.product_id === product.id && reservation.status === "reserved").reduce((sum, reservation) => sum + Number(reservation.quantity), 0); return product.stock_quantity === null || product.stock_quantity === undefined ? "—" : Math.max(0, Number(product.stock_quantity) - reserved); } },
            ]} />
            <div className="portal-card-heading" style={{ marginTop: 24 }}><div><p className="kicker">Ledger</p><h2>Recent movements</h2></div></div>
            <AdminTable rows={inventoryMovements} empty="No inventory movements yet." columns={[
              { key: "product", label: "Product", render: (movement) => inventoryProducts.find((product) => product.id === movement.product_id)?.name || movement.product_id },
              { key: "change", label: "Change", align: "right", render: (movement) => <strong className={movement.quantity_delta > 0 ? "stock-increase" : "stock-decrease"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</strong> },
              { key: "reason", label: "Reason", render: (movement) => <><strong>{movement.reason}</strong><small>{movement.reference || "No reference"}</small></> },
              { key: "created", label: "Time", align: "right", render: (movement) => new Date(movement.created_at).toLocaleString("en-MY") },
            ]} />
          </div>
        )}
        {activeSection === "files" && (
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
        {activeSection === "integrations" && canManageAdmin && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="Delivery monitor" title={`${integrationDeliveries.length} webhook deliveries`} searchLabel="Webhook events" search="" onSearch={() => undefined} placeholder="RFQ delivery history" />
            <p className="portal-hint">Failed deliveries stay visible and can be retried after the endpoint is repaired.</p>
            <AdminTable rows={integrationDeliveries} empty="No webhook deliveries yet." columns={[
              { key: "event", label: "Event", render: (delivery) => <><strong>{delivery.event_type}</strong><small>{delivery.target_url}</small></> },
              { key: "status", label: "Status", align: "center", render: (delivery) => <em className={`status-chip ${delivery.status === "succeeded" ? "accepted" : delivery.status === "failed" ? "rejected" : "reviewing"}`}>{delivery.status}</em> },
              { key: "attempts", label: "Attempts", align: "right", render: (delivery) => delivery.attempts },
              { key: "error", label: "Last error", render: (delivery) => delivery.last_error || "—" },
              { key: "action", label: "Action", align: "right", render: (delivery) => delivery.status === "succeeded" ? null : <button className="table-action" onClick={() => void retryDelivery(delivery.id)}>Retry</button> },
            ]} />
          </div>
        )}
        {activeSection === "ai-actions" && canManageAdmin && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="Human-in-the-loop automation" title="AI action queue" searchLabel="AI actions" search="" onSearch={() => undefined} placeholder="Propose work, then approve it" />
            <form className="portal-form customer-pricing-form" onSubmit={proposeAiAction}>
              <label>Suggested follow-up<input required value={aiActionDraft.title} onChange={(event) => setAiActionDraft({ ...aiActionDraft, title: event.target.value })} placeholder="Ask buyer about delivery deadline" /></label>
              <label>RFQ<select value={aiActionDraft.rfqId} onChange={(event) => setAiActionDraft({ ...aiActionDraft, rfqId: event.target.value })}><option value="">No linked RFQ</option>{rfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfq.reference} · {rfq.company_name}</option>)}</select></label>
              <label>Due<input type="datetime-local" value={aiActionDraft.dueAt} onChange={(event) => setAiActionDraft({ ...aiActionDraft, dueAt: event.target.value })} /></label>
              <button className="primary-button" disabled={savingAiAction}>{savingAiAction ? "Proposing…" : "Propose action"}</button>
            </form>
            <p className="portal-hint">Approval creates a normal CRM task. AI cannot send quotations, change prices, or alter stock through this queue.</p>
            <AdminTable rows={aiActions} empty="No AI actions yet." columns={[
              { key: "action", label: "Action", render: (action) => <><strong>{action.input?.title || action.action_type}</strong><small>{action.rfq_id ? `RFQ ${action.rfq_id.slice(0, 8)}` : "No linked RFQ"}</small></> },
              { key: "status", label: "Status", align: "center", render: (action) => <em className={`status-chip ${action.status === "executed" ? "accepted" : action.status === "rejected" || action.status === "failed" ? "rejected" : "reviewing"}`}>{action.status}</em> },
              { key: "created", label: "Created", render: (action) => new Date(action.created_at).toLocaleString("en-MY") },
              { key: "action", label: "Decision", align: "right", render: (action) => action.status === "pending" ? <span className="portal-actions"><button className="table-action" onClick={() => void decideAiAction(action.id, "approved")}>Approve</button><button className="table-action" onClick={() => void decideAiAction(action.id, "rejected")}>Reject</button></span> : null },
            ]} />
          </div>
        )}
        {activeSection === "audit" && canManageAdmin && (
          <div className="admin-table-card portal-card">
            <AdminToolbar eyebrow="Governance" title={`${auditLogs.length} recent audit events`} searchLabel="Audit trail" search="" onSearch={() => undefined} placeholder="Changes are retained here" />
            <AdminTable rows={auditLogs} empty="No audit events yet." columns={[
              { key: "action", label: "Action", render: (log) => <><strong>{log.action}</strong><small>{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}</small></> },
              { key: "actor", label: "Actor", render: (log) => log.actor_id ? `${log.actor_id.slice(0, 8)}…` : "System" },
              { key: "metadata", label: "Details", render: (log) => <code>{JSON.stringify(log.metadata || {})}</code> },
              { key: "created", label: "Time", align: "right", render: (log) => new Date(log.created_at).toLocaleString("en-MY") },
            ]} />
          </div>
        )}
        {activeSection === "settings" && (
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
              {canUsePremium && <label className="full">
                RFQ webhook URL <small>Make, Zapier, n8n, or your own endpoint</small>
                <input
                  type="url"
                  value={settings.rfq_webhook_url || ""}
                  onChange={(e) => setSettings({ ...settings, rfq_webhook_url: e.target.value })}
                  placeholder="https://hooks.example.com/supplierflow"
                />
              </label>}
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
            {canManageAdmin && canUsePremium && <div className="admin-table-card portal-card" style={{ marginTop: 24 }}>
              <div className="portal-card-heading"><div><p className="kicker">Access control</p><h2>Staff roles</h2></div><span className="portal-hint">Changes are written to the audit trail.</span></div>
              <AdminTable rows={teamMembers} empty="No staff profiles found." columns={[
                { key: "member", label: "Staff member", render: (member) => <><strong>{member.email}</strong><small>{member.id}</small></> },
                { key: "role", label: "Role", render: (member) => <select value={member.role} onChange={(event) => void saveTeamRole(member.id, event.target.value as StaffRole)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="sales">Sales</option><option value="operations">Operations</option></select> },
              ]} />
            </div>}
          </article>
        )}
    </PortalShell>
  );
}
