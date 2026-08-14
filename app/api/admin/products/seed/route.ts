import { errorResponse, requireAdmin, supabase } from "../../../_supabase";

const products = [
  ["32A Outdoor Industrial Socket", "PKF32M435", "Wiring devices", "Weatherproof socket for demanding commercial installations.", "32A, 415V, IP67, 3P+E", 86, "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=600&q=80"],
  ["20A Type C MCB", "MCB20-C", "Protection", "Reliable circuit protection for lighting and power circuits.", "20A, Type C, 6kA, 1P", 18, "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80"],
  ["24W LED Panel Light", "LGT-LED-24", "Lighting", "Low-profile LED panel for even workplace light.", "2400 lm, 6500K, 600 x 600mm", 64, "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=600&q=80"],
  ["2.5mm Twin & Earth Cable", "CAB-2.5-TWE", "Cables", "General-purpose fixed wiring cable for commercial installs.", "Copper, 100m coil, 450/750V", 152, "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80"],
  ["20mm PVC Conduit", "CON-20-PVC", "Containment", "Rigid heavy-gauge conduit for tidy cable routes.", "20mm, 3m length, PVC", 8.5, "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=600&q=80"],
  ["8 Way SPN Distribution Board", "DB-8WAY-SPN", "Distribution", "Compact single-phase board ready for MCB configurations.", "8 ways, single phase, steel", 238, "https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=600&q=80"],
  ["IP65 Junction Box", "JBOX-IP65", "Accessories", "Weatherproof enclosure for protected terminations.", "IP65, ABS, 150mm", 16, "https://images.unsplash.com/photo-1562408590-e32931084e23?auto=format&fit=crop&w=600&q=80"],
  ["13A Switched Socket", "SSO-13A-WH", "Wiring devices", "Commercial-grade switched wall socket.", "13A, 250V, white", 14, "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=600&q=80"],
  ["100A RCCB", "RCCB-100-4P", "Protection", "Earth leakage protection for distribution boards.", "100A, 30mA, 4P", 198, "https://images.unsplash.com/photo-1621905252472-e8f2e3149aa5?auto=format&fit=crop&w=600&q=80"],
  ["50W LED Floodlight", "FLT-LED-50", "Lighting", "IP65 floodlight for external work areas.", "50W, 5000 lm, IP65", 72, "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=600&q=80"],
  ["4mm Single Core Cable", "CAB-4-SC", "Cables", "Flexible copper cable for panel and building use.", "4mm, 100m coil, copper", 218, "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?auto=format&fit=crop&w=600&q=80"],
  ["Cable Tray 100mm", "TRAY-100-GI", "Containment", "Galvanised tray for organised cable support.", "100mm, 2.4m, GI", 46, "https://images.unsplash.com/photo-1581092919535-7146ff1a590f?auto=format&fit=crop&w=600&q=80"],
  ["12 Way TPN Board", "DB-12WAY-TPN", "Distribution", "Three-phase distribution board for commercial projects.", "12 ways, TPN, steel", 580, "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80"],
  ["Cable Gland M20", "GLAND-M20-NYL", "Accessories", "Nylon gland for secure cable entry.", "M20, nylon, IP68", 3.8, "https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=600&q=80"],
  ["40A Contactor", "CONT-40A-3P", "Protection", "Three-pole contactor for motor and lighting control.", "40A, 3P, 230V coil", 98, "https://images.unsplash.com/photo-1581093458791-9f3c3900df3f?auto=format&fit=crop&w=600&q=80"],
  ["Emergency Exit Light", "EXIT-LED-EM", "Lighting", "Maintained LED exit sign with battery backup.", "3 hours, LED, maintained", 62, "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80"],
  ["6mm Armoured Cable", "CAB-6-SWA", "Cables", "Heavy-duty armoured cable for external runs.", "6mm, 4 core, SWA", 680, "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80"],
  ["Metal Trunking 50mm", "TRUNK-50-GI", "Containment", "Galvanised trunking for accessible cable routes.", "50mm, 2.4m, GI", 35, "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=600&q=80"],
  ["63A Isolator Switch", "ISO-63A-4P", "Wiring devices", "Lockable isolator for safe equipment isolation.", "63A, 4P, IP65", 124, "https://images.unsplash.com/photo-1581093450021-4a7360e9a6b5?auto=format&fit=crop&w=600&q=80"],
  ["Digital Energy Meter", "METER-DIN-3P", "Accessories", "DIN rail meter for three-phase energy monitoring.", "3 phase, DIN rail, Modbus", 318, "https://images.unsplash.com/photo-1551818255-e6e10975bc17?auto=format&fit=crop&w=600&q=80"],
] as const;

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const existing = await (await supabase("products?select=sku")).json() as Array<{ sku: string }>;
    const existingSkus = new Set(existing.map((item) => item.sku));
    const rows = products.filter(([, sku]) => !existingSkus.has(sku)).map(([name, sku, category, summary, specs, price, image_url]) => ({ id: crypto.randomUUID(), name, sku, category, summary, specifications: specs.split(", "), availability: "In stock", image_type: "accessory", image_url, price, is_active: true }));
    if (rows.length) await supabase("products", { method: "POST", body: JSON.stringify(rows) });
    return Response.json({ added: rows.length });
  } catch (error) { return errorResponse(error); }
}
