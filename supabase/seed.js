// Seed script to populate Supabase gadgets table from data/gadgets.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dlpjtgbpfqkmtemxgxiq.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.warn("Notice: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY not provided in environment.");
  console.warn("Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node supabase/seed.js");
}

async function seed() {
  if (!SUPABASE_KEY) {
    console.error("Aborting seed: Missing Supabase key.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const dataPath = path.resolve(__dirname, "../data/gadgets.json");
  const rawData = fs.readFileSync(dataPath, "utf-8");
  const gadgets = JSON.parse(rawData);

  console.log(`Seeding ${gadgets.length} gadgets to ${SUPABASE_URL}...`);

  const { data, error } = await supabase
    .from("gadgets")
    .upsert(gadgets, { onConflict: "id" })
    .select();

  if (error) {
    console.error("Seeding error:", error.message);
    process.exit(1);
  }

  console.log(`Successfully seeded ${data ? data.length : gadgets.length} gadgets.`);
}

if (process.argv[1] === __filename) {
  seed();
}
