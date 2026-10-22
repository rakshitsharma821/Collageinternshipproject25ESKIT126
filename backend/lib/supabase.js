import { createClient } from "@supabase/supabase-js";

export function getSupabaseConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || "").trim();
  const serviceKey = String(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY || "").trim();

  if (!url && !serviceKey) return null;
  if (!url || !serviceKey) {
    throw new Error("Configure SUPABASE_URL and either SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname) {
    throw new Error("SUPABASE_URL must be a valid HTTPS URL.");
  }
  if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
    throw new Error("SUPABASE_URL must be the project base URL, without a REST path, query, or fragment.");
  }
  if (parsedUrl.hostname.toLowerCase() === "your-project.supabase.co") {
    throw new Error("Replace the SUPABASE_URL template placeholder with your actual Supabase project URL.");
  }

  return { url: parsedUrl.origin, serviceKey };
}

export function createSupabaseClient(config = getSupabaseConfig(), options = {}) {
  if (!config) {
    throw new Error("Supabase is not configured.");
  }
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false },
    ...options
  });
}
