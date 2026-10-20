import { createClient } from "@supabase/supabase-js";
import { formatPriceINR } from "../../lib/match.js";

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
    .select("id, product_id, store_id, price, currency, product_url, availability, source_status, observed_at")
    .eq("product_id", productId)
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
      message: "No verified price observations recorded within the selected timeframe."
    };
  }

  const prices = observations.map((o) => Number(o.price)).filter((p) => !isNaN(p) && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const latestPrice = prices.length ? prices[prices.length - 1] : null;

  return {
    history: observations.map((o) => ({
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
      count: observations.length,
      daysCovered: days,
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
  const supabaseUrl = process.env.SUPABASE_URL || "https://dlpjtgbpfqkmtemxgxiq.supabase.co";
  const supabaseKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_KaUdeDaTKpenG_aRyu_pPg_vHGUcBY5";

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Database configuration is not available on this server." }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  try {
    const supabaseClient = createClient(supabaseUrl, supabaseKey);
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
    // If table does not exist or Postgres error occurs, surface gracefully
    return new Response(
      JSON.stringify({
        success: true,
        productId: rawId,
        history: [],
        stats: null,
        message: "Historical observation table is empty or unmigrated. Execute supabase/migrations/20261020_price_observations.sql."
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  }
}
