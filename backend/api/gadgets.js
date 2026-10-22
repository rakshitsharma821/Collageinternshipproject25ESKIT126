import { createSupabaseClient, getSupabaseConfig } from "../lib/supabase.js";

export const ALLOWED_CATEGORIES = new Set(["all", "phone", "laptop", "watch", "earbuds", "tv"]);
export const MAX_QUERY_LENGTH = 80;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=60, s-maxage=300"
};

/**
 * Sanitizes search terms for PostgREST .or() filter expressions.
 * Strips delimiters and characters that can disrupt filter syntax.
 */
export function sanitizeSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return "";
  return rawQuery
    .replace(/[()\[\]{}"'\\`,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure database query executor.
 * Does NOT fall back to local JSON; surfaces real database status and records.
 */
export async function queryGadgets(supabaseClient, options = {}) {
  const { category, q, limit = DEFAULT_LIMIT, offset = 0 } = options;

  let queryBuilder = supabaseClient
    .from("gadgets")
    .select("id, name, brand, category, image_url, review, rating, created_at")
    .order("rating", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== "all") {
    queryBuilder = queryBuilder.eq("category", category);
  }

  const cleanQ = sanitizeSearchQuery(q);
  if (cleanQ) {
    // PostgREST ilike pattern across name, brand, and review
    queryBuilder = queryBuilder.or(
      `name.ilike.%${cleanQ}%,brand.ilike.%${cleanQ}%,review.ilike.%${cleanQ}%`
    );
  }

  const { data, error } = await queryBuilder;

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Serverless Netlify Function handler for GET /api/gadgets
 */
export default async function handler(req, context) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Reject non-GET methods
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: `Method ${req.method} not allowed` }),
      { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, OPTIONS" } }
    );
  }

  // 1. Parse and validate query parameters first
  const url = new URL(req.url, "http://localhost");
  const rawCategory = (url.searchParams.get("category") || "all").toLowerCase().trim();
  const rawQ = (url.searchParams.get("q") || "").trim();
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");

  if (!ALLOWED_CATEGORIES.has(rawCategory)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Invalid category filter '${rawCategory}'. Allowed categories: phone, laptop, watch, earbuds, tv, all.`
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (rawQ.length > MAX_QUERY_LENGTH) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters.`
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsedLimit = parseInt(rawLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return new Response(
        JSON.stringify({ success: false, error: "Parameter 'limit' must be a positive integer." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    limit = Math.min(parsedLimit, MAX_LIMIT);
  }

  let offset = 0;
  if (rawOffset !== null) {
    const parsedOffset = parseInt(rawOffset, 10);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Parameter 'offset' must be a non-negative integer." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
    offset = parsedOffset;
  }

  // 2. Resolve and validate Supabase credentials
  let supabaseConfig;
  try {
    supabaseConfig = getSupabaseConfig();
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 503,
      headers: CORS_HEADERS
    });
  }
  if (!supabaseConfig) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Catalog is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY.",
        message: "The GadgetVerse catalog is unavailable until Supabase is configured.",
        count: 0,
        data: []
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  }

  // 3. Query database (strictly no silent fallback)
  try {
    const supabaseClient = createSupabaseClient(supabaseConfig);

    const items = await queryGadgets(supabaseClient, {
      category: rawCategory,
      q: rawQ,
      limit,
      offset
    });

    return new Response(
      JSON.stringify({
        success: true,
        count: items.length,
        category: rawCategory === "all" ? null : rawCategory,
        data: items
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    // Log technical error details server-side only; avoid leaking table metadata or secrets to client
    console.error("[api/gadgets] Database query error:", err.code || err.name, err.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to retrieve gadgets catalog from database."
      }),
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
