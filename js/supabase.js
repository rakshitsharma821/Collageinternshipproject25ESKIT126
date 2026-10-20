// ==============================================================================
// GadgetVerse — Supabase Client Configuration & Health Check
// ==============================================================================

// Base Supabase Project URL (without /rest/v1/)
const SUPABASE_PROJECT_URL = "https://dlpjtgbpfqkmtemxgxiq.supabase.co";

// Browser-safe Publishable Key (Replace with your actual sb_publishable_... key)
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KaUdeDaTKpenG_aRyu_pPg_vHGUcBY5";

// Initialize Supabase v2 client
(function initSupabase() {
  if (typeof window.supabase !== "undefined" && typeof window.supabase.createClient === "function") {
    if (SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE_PUBLISHABLE_KEY")) {
      try {
        window.supabaseClient = window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        console.log("[GadgetVerse] Supabase client initialized.");
      } catch (e) {
        console.error("[GadgetVerse] Failed to create Supabase client:", e);
        window.supabaseClient = null;
      }
    } else {
      console.warn("[GadgetVerse] Supabase client waiting for valid publishable key. Update SUPABASE_PUBLISHABLE_KEY in js/supabase.js.");
      window.supabaseClient = null;
    }
  } else {
    console.error("[GadgetVerse] @supabase/supabase-js library was not loaded before js/supabase.js.");
    window.supabaseClient = null;
  }
})();

// Safe connection-check helper for browser console testing
window.checkSupabaseConnection = async function() {
  if (!window.supabaseClient) {
    if (!SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE_PUBLISHABLE_KEY")) {
      const msg = "Publishable key is still the placeholder. Please set SUPABASE_PUBLISHABLE_KEY in js/supabase.js.";
      console.warn("[GadgetVerse]", msg);
      return { ok: false, message: msg };
    }
    const msg = "Supabase client is not initialized. Ensure @supabase/supabase-js is loaded.";
    console.error("[GadgetVerse]", msg);
    return { ok: false, message: msg };
  }

  try {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) {
      console.error("[GadgetVerse] Supabase connection check error:", error);
      return { ok: false, error: error.message };
    }
    const result = {
      ok: true,
      message: "Successfully connected to Supabase project!",
      hasSession: Boolean(data?.session),
      projectUrl: SUPABASE_PROJECT_URL
    };
    console.log("[GadgetVerse] Supabase connection status:", result);
    return result;
  } catch (err) {
    console.error("[GadgetVerse] Unexpected connection check error:", err);
    return { ok: false, error: err?.message || String(err) };
  }
};
