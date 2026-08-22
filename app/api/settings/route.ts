import { errorResponse, supabaseJson } from "../_supabase";

export async function GET() {
  try {
    const [settings] = await supabaseJson<Array<{ company_name?: string; logo_url?: string | null }>>(
      "supplier_settings?select=company_name,logo_url&limit=1",
    );
    return Response.json({
      settings: {
        companyName: settings?.company_name || "SupplierFlow",
        logoUrl: settings?.logo_url || null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
