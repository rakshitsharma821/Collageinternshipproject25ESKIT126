import { createClient } from "@supabase/supabase-js";
import { parseShoppingIntent, recommendProducts } from "../../lib/assistant.js";
import { queryGadgets } from "./gadgets.mjs";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=60, s-maxage=180"
};

export default async function handler(req, context) {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: `Method ${req.method} not allowed` }),
      { status: 405, headers: { ...CORS_HEADERS, Allow: "GET, POST, OPTIONS" } }
    );
  }

  let prompt = "";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      prompt = (body.prompt || body.q || "").trim();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body. Expected { prompt: '...' }" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } else {
    const urlObj = new URL(req.url, "http://localhost");
    prompt = (urlObj.searchParams.get("prompt") || urlObj.searchParams.get("q") || "").trim();
  }

  if (!prompt || prompt.length < 3) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Please provide a shopping requirement (e.g. 'phone under 25000 with good camera')."
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (prompt.length > 300) {
    return new Response(
      JSON.stringify({ success: false, error: "Prompt exceeds maximum length of 300 characters." }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // 1. Parse natural-language intent
  const criteria = parseShoppingIntent(prompt);

  // 2. Fetch candidates from database
  let candidates = [];
  const supabaseUrl = process.env.SUPABASE_URL || "https://dlpjtgbpfqkmtemxgxiq.supabase.co";
  const supabaseKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_KaUdeDaTKpenG_aRyu_pPg_vHGUcBY5";

  if (supabaseUrl && supabaseKey) {
    try {
      const client = createClient(supabaseUrl, supabaseKey);
      const items = await queryGadgets(client, {
        category: criteria.category || "all",
        limit: 50
      });
      candidates = items;
    } catch (err) {
      console.warn("[assistant] Could not load candidate catalog from DB:", err.message);
    }
  }

  // 3. Score and rank candidates against parsed criteria
  const recommendations = recommendProducts(candidates, criteria);

  return new Response(
    JSON.stringify({
      success: true,
      prompt,
      parsedCriteria: {
        budgetMax: criteria.budgetMax,
        category: criteria.category,
        priorityFeatures: criteria.priorityFeatures,
        preferredBrands: criteria.preferredBrands
      },
      totalFound: recommendations.length,
      recommendations
    }),
    { status: 200, headers: CORS_HEADERS }
  );
}
