/**
 * GadgetVerse — Scheduled Price Drop Alert Job
 * Checks active price targets against verified store observations.
 * Supports email notification delivery via Resend or documented provider.
 */

import { evaluatePriceDropAlerts } from "./budget.js";
import { checkOfferComparability } from "./match.js";
import { validateProductUrl } from "./compare.js";
import { createSupabaseClient, getSupabaseConfig } from "./supabase.js";

const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;
const CLAIM_RECOVERY_MS = 20 * 60 * 1000;

export async function sendEmailNotification({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      reason: !apiKey
        ? "Email provider not configured (RESEND_API_KEY missing)."
        : "Email provider sender is not configured (ALERT_FROM_EMAIL missing)."
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        text
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        delivered: false,
        reason: errData.message || `Provider returned status ${res.status}`
      };
    }

    const data = await res.json();
    return {
      delivered: true,
      id: data.id
    };
  } catch (error) {
    return {
      delivered: false,
      reason: error.message || "Failed to reach email delivery provider"
    };
  }
}

export async function runPriceDropCheck(options = {}) {
  let supabaseConfig;
  try {
    supabaseConfig = getSupabaseConfig();
  } catch (error) {
    return { success: false, error: error.message };
  }
  if (!supabaseConfig) {
    return {
      success: false,
      error: "Supabase credentials are not configured. Cannot check price alerts."
    };
  }

  const client = options.supabaseClient || createSupabaseClient(supabaseConfig);

  // 1. Fetch active alerts that haven't been notified yet or are enabled
  const { data: alerts, error: alertsError } = await client
    .from("price_alerts")
    .select("id, product_id, product_name, email, target_price, notified_at, enabled, notification_status, updated_at")
    .eq("enabled", true)
    .is("notified_at", null)
    .or(`notification_status.is.null,notification_status.eq.pending_provider,and(notification_status.eq.sending,updated_at.lt.${new Date(Date.now() - CLAIM_RECOVERY_MS).toISOString()})`)
    .limit(200);

  if (alertsError) {
    return { success: false, error: `Failed to query active alerts: ${alertsError.message}` };
  }

  if (!alerts || alerts.length === 0) {
    return { success: true, message: "No pending price drop alerts to evaluate.", triggeredCount: 0 };
  }

  // 2. Fetch latest verified price observations for distinct product IDs
  const productIds = [...new Set(alerts.map((a) => a.product_id))];
  const { data: observations, error: obsError } = await client
    .from("price_observations")
    .select("product_id, store_id, price, product_url, observed_at, source_status, currency, availability, metadata")
    .in("product_id", productIds)
    .eq("source_status", "verified")
    .eq("currency", "INR")
    .order("observed_at", { ascending: false });

  if (obsError) {
    return { success: false, error: `Failed to query observations: ${obsError.message}` };
  }

  // Build latest observation map (lowest verified price per product)
  const obsMap = new Map();
  const checkedProducts = new Set();
  for (const obs of observations || []) {
    if (checkedProducts.has(obs.product_id)) continue;
    checkedProducts.add(obs.product_id);
    const price = Number(obs.price);
    const observedAt = Date.parse(obs.observed_at);
    if (obs.source_status !== "verified" ||
        obs.currency !== "INR" ||
        obs.availability !== "in_stock" ||
        obs.metadata?.comparable !== true ||
        obs.metadata?.matchEvidence?.exactIdentity !== true ||
        !Number.isFinite(price) || price <= 0 ||
        !Number.isFinite(observedAt) || observedAt > Date.now() ||
        Date.now() - observedAt > MAX_OBSERVATION_AGE_MS ||
        !validateProductUrl(obs.product_url).valid) continue;
    obsMap.set(obs.product_id, {
      price,
      store: obs.store_id,
      url: obs.product_url,
      observedAt: obs.observed_at,
      title: obs.metadata.title
    });
  }

  // 3. Format tracked products for evaluation
  const eligibleAlerts = alerts.filter((alert) => {
    const observation = obsMap.get(alert.product_id);
    return observation && checkOfferComparability(alert.product_name, observation.title).comparable;
  });
  const trackedItems = eligibleAlerts.map((a) => ({
    id: a.id,
    product_id: a.product_id,
    name: a.product_name,
    target_price: Number(a.target_price),
    email: a.email,
    alert_enabled: a.enabled
  }));

  const triggered = evaluatePriceDropAlerts(trackedItems, obsMap, new Set());
  const results = [];

  for (const item of triggered) {
    const matchingAlert = eligibleAlerts.find((a) => a.id === item.alertId);
    const targetEmail = matchingAlert?.email || item.email;
    if (!targetEmail) continue;
    const claimTime = new Date().toISOString();
    const staleClaimCutoff = new Date(Date.now() - CLAIM_RECOVERY_MS).toISOString();
    const { data: claim, error: claimError } = await client
      .from("price_alerts")
      .update({ notification_status: "sending", updated_at: claimTime, notification_note: null })
      .eq("id", matchingAlert.id)
      .is("notified_at", null)
      .or(`notification_status.is.null,notification_status.eq.pending_provider,and(notification_status.eq.sending,updated_at.lt.${staleClaimCutoff})`)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("[AlertChecker] Could not claim price alert:", claimError.code || claimError.name);
      results.push({ productId: item.productId, delivered: false, reason: "Price alert could not be claimed safely." });
      continue;
    }
    if (!claim) continue;

    const emailSubject = `Price Drop Alert: ${item.productName} is now ${item.formattedObserved}!`;
    const emailText = `Great news! ${item.productName} dropped to ${item.formattedObserved}, which is below your target price of ${item.formattedTarget}. You save ${item.formattedSavings} at ${item.store}.\n\nCheck offer: ${item.url || 'https://gadgetverse.in'}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0f766e;">GadgetVerse Price Drop Alert</h2>
        <p><strong>${item.productName}</strong> has dropped below your target price!</p>
        <div style="background: #edf7ef; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="font-size: 20px; font-weight: bold; color: #15803d; margin: 0;">Current Price: ${item.formattedObserved}</p>
          <p style="color: #5a5d66; margin: 4px 0 0;">Your Target: ${item.formattedTarget} (Save ${item.formattedSavings})</p>
          <p style="color: #5a5d66; margin: 4px 0 0;">Retailer: ${item.store}</p>
        </div>
        ${item.url ? `<p><a href="${item.url}" style="display: inline-block; background: #0f766e; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px;">View on ${item.store}</a></p>` : ''}
        <p style="color: #8a8d96; font-size: 12px; margin-top: 24px;">You received this because you requested a price drop notification on GadgetVerse.</p>
      </div>
    `;

    // Attempt delivery if provider configured
    const delivery = await sendEmailNotification({
      to: targetEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHtml
    });

    // Update alert status in database
    const updateData = {
      updated_at: new Date().toISOString(),
      notification_status: delivery.delivered ? "sent" : "pending_provider",
      notification_id: delivery.delivered ? delivery.id : null,
      notification_note: delivery.delivered ? null : delivery.reason
    };
    if (delivery.delivered) updateData.notified_at = updateData.updated_at;
    const { error: updateError } = await client
      .from("price_alerts")
      .update(updateData)
      .eq("id", matchingAlert.id);
    if (updateError) {
      console.error("[AlertChecker] Could not persist price alert outcome:", updateError.code || updateError.name);
      results.push({ productId: item.productId, delivered: delivery.delivered, persisted: false });
      continue;
    }

    results.push({
      productId: item.productId,
      delivered: delivery.delivered,
      persisted: true,
      reason: delivery.reason
    });
  }

  return {
    success: true,
    triggeredCount: triggered.length,
    results
  };
}

// Standalone execution entrypoint (e.g. Render Cron / GitHub Actions)
if (process.argv[1] && process.argv[1].endsWith("alert-checker.js")) {
  console.log("[AlertChecker] Starting scheduled price drop check...");
  runPriceDropCheck()
    .then((res) => {
      console.log("[AlertChecker] Completed:", JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[AlertChecker] Error:", err);
      process.exit(1);
    });
}
