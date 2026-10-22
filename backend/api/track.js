import { extractProductAttributes } from "../lib/match.js";
import { productHistoryKey } from "../lib/history.js";
import { createSupabaseClient, getSupabaseConfig } from "../lib/supabase.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

export async function savePriceAlert(client, alert) {
  const { data: gadget, error: gadgetError } = await client
    .from("gadgets")
    .select("id, name")
    .eq("id", alert.productId)
    .maybeSingle();
  if (gadgetError) throw gadgetError;

  const catalogMatch = gadget &&
    gadget.name.trim().toLocaleLowerCase() === alert.productName.trim().toLocaleLowerCase();
  const hasModelIdentity = extractProductAttributes(alert.productName).modelIdentifiers.length > 0;
  const stableModelMatch = hasModelIdentity &&
    productHistoryKey(alert.productName) === alert.productId;
  if (!catalogMatch && !stableModelMatch) {
    return { saved: false, error: "This product could not be identified reliably. Compare an exact catalog item or include its model number." };
  }

  const { data, error } = await client
    .from("price_alerts")
    .upsert({
      product_id: alert.productId,
      product_name: alert.productName,
      email: alert.email,
      target_price: alert.targetPrice,
      enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "product_id,email,target_price" })
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Database did not confirm the saved price alert.");
  return { saved: true };
}

export default async function handler(request, context = {}) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Only POST is allowed." }), {
      status: 405,
      headers: { ...HEADERS, Allow: "POST" }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Send a valid JSON request." }), {
      status: 400,
      headers: HEADERS
    });
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const targetPrice = Number(body.targetPrice);

  if (!/^[a-z0-9-]{1,100}$/i.test(productId) || productName.length < 2 || productName.length > 160) {
    return new Response(JSON.stringify({ success: false, error: "Compare a valid product before setting a price target." }), {
      status: 400,
      headers: HEADERS
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return new Response(JSON.stringify({ success: false, error: "Enter a valid email address." }), {
      status: 400,
      headers: HEADERS
    });
  }
  if (!Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice > 100000000) {
    return new Response(JSON.stringify({ success: false, error: "Enter a valid target price in rupees." }), {
      status: 400,
      headers: HEADERS
    });
  }

  let supabaseConfig;
  try {
    supabaseConfig = getSupabaseConfig();
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 503,
      headers: HEADERS
    });
  }
  if (!supabaseConfig) {
    return new Response(JSON.stringify({
      success: false,
      error: "Price tracking is unavailable until SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY are configured."
    }), { status: 503, headers: HEADERS });
  }

  try {
    const client = context.supabaseClient || createSupabaseClient(supabaseConfig);
    const saved = await savePriceAlert(client, {
      productId,
      productName,
      email,
      targetPrice
    });
    if (!saved.saved) {
      return new Response(JSON.stringify({ success: false, error: saved.error }), {
        status: 422,
        headers: HEADERS
      });
    }
    return new Response(JSON.stringify({
      success: true,
      message: "Price target saved. Checks will begin when a verified offer is available."
    }), { status: 200, headers: HEADERS });
  } catch (error) {
    console.error("[api/track] Could not save price target:", error.code || error.name, error.message);
    return new Response(JSON.stringify({ success: false, error: "Could not save this price target." }), {
      status: 502,
      headers: HEADERS
    });
  }
}
