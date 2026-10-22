import { createSupabaseClient, getSupabaseConfig } from "../lib/supabase.js";
import { formatPriceINR } from "../lib/match.js";
import { validateProductUrl } from "../lib/compare.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=60, s-maxage=300"
};

export const MAX_PRODUCT_ID_LENGTH = 100;
export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 365;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/**
 * Pure database query executor for price observations.
 */
export async function queryPriceHistory(supabaseClient, options = {}) {
  const { productId, days = DEFAULT_DAYS, limit = DEFAULT_LIMIT } = options;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const { data, error } = await supabaseClient
    .from("price_observations")
    .select("id, product_id, store_id, price, currency, product_url, availability, source_status, observed_at, metadata")
    .eq("product_id", productId)
    .eq("currency", "INR")
    .eq("source_status", "verified")
    .gte("observed_at", sinceDate.toISOString())
    .order("observed_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const observations = Array.isArray(data) ? data : [];

  if (observations.length === 0) {
    return {
      history: [],
      stats: null,
      message: "No verified exact-product observations recorded within the selected timeframe."
    };
  }

  const verifiedObservations = observations.filter((o) =>
    Number.isFinite(Number(o.price)) &&
    Number(o.price) > 0 &&
    Number.isFinite(Date.parse(o.observed_at)) &&
    Date.parse(o.observed_at) <= Date.now() &&
    o.metadata?.comparable === true &&
    o.metadata?.matchEvidence?.exactIdentity === true &&
    typeof o.metadata?.source === "string" &&
    o.metadata.source.trim().length > 0 &&
    ["in_stock", "out_of_stock"].includes(o.availability) &&
    validateProductUrl(o.product_url).valid
  );
  if (!verifiedObservations.length) {
    return {
      history: [],
      stats: null,
      message: "No verified exact-product observations recorded within the selected timeframe."
    };
  }
  const prices = verifiedObservations.map((o) => Number(o.price));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const latestPrice = prices.length ? prices[prices.length - 1] : null;
  const firstTime = Date.parse(verifiedObservations[0].observed_at);
  const lastTime = Date.parse(verifiedObservations.at(-1).observed_at);

  return {
    history: verifiedObservations.map((o) => ({
      id: o.id,
      store: o.store_id,
      price: Number(o.price),
      formattedPrice: formatPriceINR(Number(o.price)),
      currency: o.currency || "INR",
      url: o.product_url,
      availability: o.availability,
      sourceStatus: o.source_status,
      observedAt: o.observed_at
    })),
    stats: {
      count: verifiedObservations.length,
      daysCovered: Math.max(0, Math.floor((lastTime - firstTime) / 86400000)),
      minPrice,
      formattedMinPrice: minPrice ? formatPriceINR(minPrice) : null,
      maxPrice,
      formattedMaxPrice: maxPrice ? formatPriceINR(maxPrice) : null,
      avgPrice,
      formattedAvgPrice: avgPrice ? formatPriceINR(avgPrice) : null,
      latestPrice,
      formattedLatestPrice: latestPrice ? formatPriceINR(latestPrice) : null
    }
  };
}

/**
 * Serverless Netlify Function handler for GET /api/price-history
 */
export default async function handler(req, context) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Reject non-GET
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: `Method ${req.method} not allowed` }),
      { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" } }
    );
  }

  const url = new URL(req.url, "http://localhost");
  const rawId = (url.searchParams.get("productId") || url.searchParams.get("id") || "").trim();
  const rawDays = url.searchParams.get("days");
  const rawLimit = url.searchParams.get("limit");

  if (!rawId) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required query parameter ?productId=" }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (rawId.length > MAX_PRODUCT_ID_LENGTH) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `productId exceeds maximum allowed length of ${MAX_PRODUCT_ID_LENGTH} characters.`
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const days = rawDays ? Math.max(1, Math.min(MAX_DAYS, parseInt(rawDays, 10) || DEFAULT_DAYS)) : DEFAULT_DAYS;
  const limit = rawLimit ? Math.max(1, Math.min(MAX_LIMIT, parseInt(rawLimit, 10) || DEFAULT_LIMIT)) : DEFAULT_LIMIT;

  // Supabase client initialization
  let supabaseConfig;
  try {
    supabaseConfig = getSupabaseConfig();
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      productId: rawId,
      history: [],
      stats: null,
      message: err.message
    }), { status: 503, headers: CORS_HEADERS });
  }
  if (!supabaseConfig) {
    return new Response(
      JSON.stringify({
        success: false,
        productId: rawId,
        history: [],
        stats: null,
        message: "Price history is unavailable until SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY are configured."
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  }

  try {
    const supabaseClient = createSupabaseClient(supabaseConfig);
    const result = await queryPriceHistory(supabaseClient, { productId: rawId, days, limit });

    return new Response(
      JSON.stringify({
        success: true,
        productId: rawId,
        days,
        ...result
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[api/price-history] Database query failed:", err.code || err.name, err.message);
    return new Response(
      JSON.stringify({
        success: false,
        productId: rawId,
        history: [],
        stats: null,
        message: "Price history could not be loaded. Check the price_observations migration."
      }),
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
