const clean = (value) => value?.replace(/\s+/g, " ").trim();

export function requestedQuantity(text) {
  const quantity = text.match(/(?:add|put|include)\s+(\d{1,5})\b/i)?.[1] || text.match(/\b(\d{1,5})\s*(?:pcs?|pieces?|units?)\b/i)?.[1];
  return quantity ? Number(quantity) : null;
}

export function mergeCustomerDetails(current, text) {
  const email = text.match(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/)?.[0];
  const contact = text.match(/(?:contact|buyer)\s*:\s*([^,\n]+),\s*([^,\n]+),\s*[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i);
  const name = clean(text.match(/(?:^|\n)\s*[-*]?\s*name\s*:\s*([^\n]+)/im)?.[1]) || clean(text.match(/(?:my\s+name\s+is|name\s+is|i\s+am|i'm)\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?=\s*(?:,|\.|;|\b(?:from|at|company|email)\b|$))/i)?.[1]);
  const company = clean(text.match(/(?:^|\n)\s*[-*]?\s*company\s*:\s*([^\n]+)/im)?.[1]) || clean(text.match(/(?:company(?:\s+is)?|from)\s+([A-Za-z0-9][A-Za-z0-9 &.'-]{1,60}?)(?=\s*(?:,|\.|;|\b(?:my\s+)?email\b|$))/i)?.[1]);
  return { ...current, ...(name || clean(contact?.[1]) ? { name: name || clean(contact?.[1]) } : {}), ...(company || clean(contact?.[2]) ? { company: company || clean(contact?.[2]) } : {}), ...(email ? { email } : {}) };
}

export function cartActionsFromSummary(products, text) {
  const bySku = new Map(products.map((product) => [product.sku.toLowerCase(), product.id]));
  const actions = new Map();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const sku = lines[index].match(/\((?:sku\s*)?([A-Za-z0-9._-]+)\)/i)?.[1]?.toLowerCase();
    const quantity = lines.slice(index, index + 3).join(" ").match(/(?:quantity|qty)\s*:\s*(\d{1,5})\b/i)?.[1];
    const productId = sku && bySku.get(sku);
    if (productId && quantity) actions.set(productId, Number(quantity));
  }
  return [...actions].map(([productId, quantity]) => ({ productId, quantity }));
}
