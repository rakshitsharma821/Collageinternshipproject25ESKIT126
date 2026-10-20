import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dlpjtgbpfqkmtemxgxiq.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_KaUdeDaTKpenG_aRyu_pPg_vHGUcBY5";

function getLocalGadgets() {
  try {
    const dataPath = path.resolve(__dirname, "../../data/gadgets.json");
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Local gadgets read error:", err);
  }
  return [];
}

export default async function handler(req) {
  const url = new URL(req.url);
  const category = (url.searchParams.get("category") || "").toLowerCase().trim();
  const q = (url.searchParams.get("q") || "").toLowerCase().trim();

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  let gadgets = [];

  // 1. Try Supabase query
  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      let query = supabase.from("gadgets").select("*");

      if (category && category !== "all") {
        query = query.eq("category", category);
      }

      if (q) {
        query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,review.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        gadgets = data;
      }
    }
  } catch (err) {
    console.warn("Supabase fetch failed, falling back to local dataset:", err.message);
  }

  // 2. Fallback to local data/gadgets.json if Supabase returned no rows
  if (!gadgets.length) {
    const local = getLocalGadgets();
    gadgets = local.filter((item) => {
      const matchesCategory = !category || category === "all" || item.category.toLowerCase() === category;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        (item.review && item.review.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      count: gadgets.length,
      data: gadgets
    }),
    { status: 200, headers }
  );
}
