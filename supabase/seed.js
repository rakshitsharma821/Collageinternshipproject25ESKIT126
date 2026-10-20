// Seed script to populate Supabase gadgets table from data/gadgets.json
// Idempotently upserts gadgets and guarantees NO price fields are inserted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dlpjtgbpfqkmtemxgxiq.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

export const ALLOWED_CATEGORIES = new Set(["phone", "laptop", "watch", "earbuds", "tv"]);

/**
 * Sanitizes a gadget item to strictly adhere to the database schema.
 * Explicitly excludes any pricing fields to ensure prices are never stored in the catalog.
 */
export function sanitizeGadgetItem(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Invalid gadget item: expected an object");
  }

  const { id, name, brand, category, image_url, review, rating } = item;

  if (!id || typeof id !== "string") throw new Error("Gadget item missing required string 'id'");
  if (!name || typeof name !== "string") throw new Error(`Gadget '${id}' missing required string 'name'`);
  if (!brand || typeof brand !== "string") throw new Error(`Gadget '${id}' missing required string 'brand'`);
  if (!category || typeof category !== "string") throw new Error(`Gadget '${id}' missing required string 'category'`);

  const cleanCategory = category.toLowerCase().trim();
  if (!ALLOWED_CATEGORIES.has(cleanCategory)) {
    throw new Error(`Gadget '${id}' has unsupported category '${category}'`);
  }

  const cleanRating = typeof rating === "number" && !isNaN(rating) ? Number(rating.toFixed(2)) : null;

  // Explicitly return only schema-defined columns, strictly omitting any price
  return {
    id: id.trim(),
    name: name.trim(),
    brand: brand.trim(),
    category: cleanCategory,
    image_url: typeof image_url === "string" ? image_url.trim() : null,
    review: typeof review === "string" ? review.trim() : null,
    rating: cleanRating
  };
}

export function loadAndSanitizeSeedData(filePath) {
  const dataPath = filePath || path.resolve(__dirname, "../data/gadgets.json");
  const rawData = fs.readFileSync(dataPath, "utf-8");
  const rawGadgets = JSON.parse(rawData);

  if (!Array.isArray(rawGadgets) || rawGadgets.length === 0) {
    throw new Error("Seed file is empty or does not contain a JSON array");
  }

  return rawGadgets.map(sanitizeGadgetItem);
}

export async function runSeed(supabaseClient, sanitizedGadgets) {
  const gadgets = sanitizedGadgets || loadAndSanitizeSeedData();
  const client = supabaseClient || createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data, error } = await client
    .from("gadgets")
    .upsert(gadgets, { onConflict: "id" })
    .select("id, name, category");

  if (error) {
    throw new Error(`Supabase seed error [${error.code}]: ${error.message}`);
  }

  return {
    success: true,
    count: data ? data.length : gadgets.length,
    seeded: data
  };
}

async function cli() {
  if (!SUPABASE_KEY) {
    console.error("Error: Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY environment variable.");
    console.error("Usage: SUPABASE_SERVICE_ROLE_KEY=<service_key> node supabase/seed.js");
    process.exit(1);
  }

  console.log(`Loading seed data from data/gadgets.json...`);
  const gadgets = loadAndSanitizeSeedData();
  console.log(`Sanitized ${gadgets.length} gadgets (strictly zero prices).`);

  console.log(`Upserting to Supabase at ${SUPABASE_URL}...`);
  try {
    const res = await runSeed(null, gadgets);
    console.log(`Successfully seeded ${res.count} gadgets to 'public.gadgets' table.`);
  } catch (err) {
    console.error("Seeding failed:", err.message);
    process.exit(1);
  }
}

if (process.argv[1] === __filename) {
  cli();
}
