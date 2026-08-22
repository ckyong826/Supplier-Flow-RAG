import { supabaseJson } from "./_supabase";

export type CatalogueProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  summary: string;
  specifications: string[];
  availability: string;
  price: number;
  stock_quantity?: number | null;
  image_url?: string | null;
  image_type?: string;
  datasheet_path?: string | null;
};

const ACTIVE_PRODUCTS = "products?is_active=eq.true&select=id,name,sku,category,summary,specifications,availability,price,stock_quantity,image_url,image_type,datasheet_path&order=name.asc";

export function listActiveProducts(limit?: number, offset = 0) {
  const pagination = limit === undefined ? "" : `&limit=${limit}&offset=${Math.max(0, offset)}`;
  return supabaseJson<CatalogueProduct[]>(`${ACTIVE_PRODUCTS}${pagination}`);
}

export async function activeProductsById(ids: readonly string[]) {
  const products = await listActiveProducts();
  return new Map(products.filter((product) => ids.includes(product.id)).map((product) => [product.id, product]));
}

export function productText(product: CatalogueProduct) {
  return `${product.name} ${product.sku} ${product.category} ${product.summary} ${(product.specifications || []).join(" ")}`;
}

export function productFacts(products: CatalogueProduct[]) {
  return products.map((product) => `${product.name} | SKU ${product.sku} | ${product.category} | ${product.summary} | Specs: ${(product.specifications || []).join(", ")} | Status: ${product.availability} | Stock: ${product.stock_quantity === null || product.stock_quantity === undefined ? "Not tracked" : `${product.stock_quantity} units tracked`} | Price: ${Number(product.price) > 0 ? `RM ${Number(product.price).toFixed(2)}` : "Price on request"}`).join("\n");
}
