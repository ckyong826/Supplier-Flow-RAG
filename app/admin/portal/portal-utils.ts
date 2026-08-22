import type { ProductDraft, QuoteItem, Section } from "./types";

export const portalMenu: Array<[Section, string]> = [
  ["dashboard", "Overview"],
  ["knowledge", "Knowledge base"],
  ["rfqs", "RFQ inbox"],
  ["customers", "Customer accounts"],
  ["tasks", "Tasks & follow-up"],
  ["quotations", "Quotations"],
  ["products", "Products"],
  ["inventory", "Inventory"],
  ["settings", "Company settings"],
  ["integrations", "Integrations"],
  ["ai-actions", "AI action queue"],
  ["audit", "Audit trail"],
];

export const blankProduct: ProductDraft = {
  id: "",
  name: "",
  sku: "",
  category: "Accessories",
  summary: "",
  specs: "",
  availability: "In stock",
  stockQuantity: "",
  imageClass: "accessory",
  imageUrl: "",
  datasheetPath: "",
  price: "",
  isActive: true,
};

export function quoteValues(
  items: Array<Pick<QuoteItem, "quantity" | "unit_price">>,
  discount: number,
  tax: number,
  delivery: number,
) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  const discountValue = (subtotal * Number(discount || 0)) / 100;
  const taxable = subtotal - discountValue;
  const taxValue = (taxable * Number(tax || 0)) / 100;
  return { subtotal, discountValue, taxable, taxValue, total: taxable + taxValue + Number(delivery || 0) };
}
