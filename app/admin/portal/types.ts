export type Section =
  | "dashboard"
  | "knowledge"
  | "rfqs"
  | "customers"
  | "tasks"
  | "quotations"
  | "products"
  | "inventory"
  | "files"
  | "settings"
  | "integrations"
  | "ai-actions"
  | "audit";

export type StaffRole = "owner" | "admin" | "manager" | "sales" | "operations";
export type StaffMember = { id: string; email: string; role: StaffRole };

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  summary: string;
  specifications?: string[];
  availability?: string;
  stock_quantity?: number | null;
  image_type?: string;
  image_url?: string | null;
  datasheet_path?: string | null;
  price: number;
  is_active: boolean;
};

export type RfqItem = { product_id: string; product_name: string; sku: string; quantity: number };
export type Rfq = {
  id: string;
  reference: string;
  customer_name: string;
  company_name: string;
  email: string;
  status: string;
  account_id?: string | null;
  assigned_to?: string | null;
  follow_up_date?: string | null;
  requirements?: string;
  rfq_items: RfqItem[];
  activity_logs?: Array<{ id: string; message: string }>;
};

export type QuoteItem = { product_name: string; sku: string; quantity: number; unit_price: number; is_alternative: boolean };
export type Quote = {
  id: string;
  rfq_id: string;
  reference: string;
  revision: number;
  status: string;
  approval_status?: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  discount_percent: number;
  tax_percent: number;
  delivery_fee: number;
  validity_days: number;
  payment_terms?: string;
  notes?: string;
  created_at: string;
  rfqs?: { reference: string; company_name: string; customer_name: string; email: string };
  quotation_items: QuoteItem[];
};

export type Settings = {
  company_name: string;
  registration_number?: string;
  address?: string;
  email?: string;
  phone?: string;
  logo_url?: string | null;
  rfq_webhook_url?: string | null;
  quotation_validity_days: number;
  payment_terms?: string;
  sst_percent: number;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  source_type: string;
  source_name?: string | null;
  is_public?: boolean;
  content?: string;
  created_at?: string;
  knowledge_chunks?: Array<{ count: number }>;
};

export type CustomerPriceRule = {
  id: string;
  customer_email: string;
  account_id?: string | null;
  product_id: string;
  unit_price: number;
  customer_accounts?: { company_name?: string; primary_email?: string } | null;
  products?: { name?: string; sku?: string } | null;
};

export type CustomerAccount = {
  id: string;
  company_name: string;
  primary_contact_name: string;
  primary_email: string;
  phone?: string | null;
  status: "active" | "on_hold";
  assigned_sales_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  rfqs?: Array<{ count: number }>;
  customer_price_overrides?: Array<{ count: number }>;
};

export type CustomerDraft = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  status: "active" | "on_hold";
  notes: string;
};

export type AuditLog = {
  id: string;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type CrmTask = {
  id: string;
  rfq_id?: string | null;
  account_id?: string | null;
  assignee_id?: string | null;
  title: string;
  task_type: "call" | "email" | "follow_up" | "internal";
  due_at?: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  notes?: string | null;
  completed_at?: string | null;
  created_at: string;
  rfqs?: { reference?: string; company_name?: string } | null;
  customer_accounts?: { company_name?: string } | null;
};

export type TaskDraft = {
  title: string;
  taskType: string;
  rfqId: string;
  accountId: string;
  assigneeId: string;
  dueAt: string;
  notes: string;
};

export type InventoryReservation = {
  id: string;
  product_id: string;
  rfq_id?: string | null;
  quantity: number;
  status: "reserved" | "released" | "fulfilled";
  expires_at?: string | null;
  created_at: string;
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  quantity_delta: number;
  reason: string;
  reference?: string | null;
  created_at: string;
};

export type IntegrationDelivery = {
  id: string;
  event_type: string;
  target_url: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

export type AiAction = {
  id: string;
  action_type: string;
  rfq_id?: string | null;
  requested_by?: string | null;
  approved_by?: string | null;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  input: { title?: string; dueAt?: string | null; taskType?: string };
  result?: Record<string, unknown>;
  error?: string | null;
  created_at: string;
};

export type Line = RfqItem & { unitPrice: number };
export type ProductDraft = {
  id: string;
  name: string;
  sku: string;
  category: string;
  summary: string;
  specs: string;
  availability: string;
  stockQuantity: string;
  imageClass: string;
  imageUrl: string;
  datasheetPath: string;
  price: string;
  isActive: boolean;
};
