// Seed & Migration Management Script for GadgetVerse
// Note: Static catalog seeding is deprecated in favor of live, search-driven comparison.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseClient, getSupabaseConfig } from "../lib/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Configure SUPABASE_URL and either SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY.");
  }
  return config;
}

export const SEEDED_GADGET_IDS = Object.freeze([
  "p1", "p2", "p3",
  "l1", "l2", "l3", "l4", "l5", "l6",
  "w1", "w2", "w3",
  "e1", "e2", "e3",
  "t1", "t2", "t3", "t4"
]);

export const ALLOWED_CATEGORIES = new Set(["phone", "laptop", "watch", "earbuds", "tv"]);

/**
 * Sanitizes a gadget item to strictly adhere to the database schema.
 * Strictly excludes any pricing fields to prevent storing stale prices.
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

/**
 * Safely and explicitly deletes only the 19 known seeded gadget rows.
 * Requires service_role key to satisfy RLS policies.
 */
export async function removeSeededCatalog(supabaseClient) {
  const client = supabaseClient || createSupabaseClient(requireSupabaseConfig());

  const { data, error } = await client
    .from("gadgets")
    .delete()
    .in("id", SEEDED_GADGET_IDS)
    .select("id, name");

  if (error) {
    throw new Error(`Failed to remove seeded catalog [${error.code}]: ${error.message}`);
  }

  return {
    success: true,
    deletedCount: data ? data.length : 0,
    deletedItems: data || []
  };
}

/**
 * Explicit seed function (opt-in only via --force-seed).
 */
export async function runSeed(supabaseClient, sanitizedGadgets) {
  const gadgets = sanitizedGadgets || loadAndSanitizeSeedData();
  const client = supabaseClient || createSupabaseClient(requireSupabaseConfig());

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
  const args = process.argv.slice(2);

  if (args.includes("--delete-seeded")) {
    let config;
    try {
      config = getSupabaseConfig();
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!config) {
      console.error("Error: Deleting seeded catalog rows requires SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY.");
      process.exit(1);
    }
    console.log(`Executing safe deletion of 19 seed IDs from public.gadgets...`);
    try {
      const res = await removeSeededCatalog(null);
      console.log(`Success: Deleted ${res.deletedCount} seed rows from public.gadgets.`);
    } catch (err) {
      console.error("Deletion error:", err.message);
      process.exit(1);
    }
    return;
  }

  if (args.includes("--force-seed")) {
    let config;
    try {
      config = getSupabaseConfig();
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!config) {
      console.error("Error: Seeding catalog requires SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY.");
      process.exit(1);
    }
    console.log("Seeding catalog (strictly without price fields)...");
    try {
      const res = await runSeed(null);
      console.log(`Successfully seeded ${res.count} items.`);
    } catch (err) {
      console.error("Seeding error:", err.message);
      process.exit(1);
    }
    return;
  }

  console.log("------------------------------------------------------------------");
  console.log("Catalog seeding is opt-in. It never stores prices.");
  console.log("");
  console.log("To delete the 19 legacy seed rows from public.gadgets:");
  console.log("  SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<key> node supabase/seed.js --delete-seeded");
  console.log("");
  console.log("Or execute the migration SQL in your Supabase SQL Editor:");
  console.log("  supabase/migrations/20261020_remove_seeded_catalog.sql");
  console.log("------------------------------------------------------------------");
}

if (process.argv[1] === __filename) {
  cli();
}
