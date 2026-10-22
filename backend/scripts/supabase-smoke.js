import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "../lib/load-env.js";
import { createSupabaseClient, getSupabaseConfig } from "../lib/supabase.js";

const TABLES = ["gadgets", "price_observations", "price_alerts"];

function redactDiagnostic(value) {
  let message = String(value ?? "");
  const secretValues = [
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_URL
  ].filter((secret) => typeof secret === "string" && secret.length > 0);

  for (const secret of secretValues) {
    message = message.split(secret).join("[REDACTED]");
    try {
      const parsed = new URL(secret);
      if (parsed.hostname) message = message.split(parsed.hostname).join("[SUPABASE_HOST]");
      if (parsed.username) message = message.split(parsed.username).join("[REDACTED]");
      if (parsed.password) message = message.split(parsed.password).join("[REDACTED]");
    } catch {
      continue;
    }
  }

  return message
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:eyJ[a-zA-Z0-9_-]{8,}\.){2}[a-zA-Z0-9_-]+\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co\b/gi, "[SUPABASE_HOST]")
    .replace(/\b(apikey|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

export function safeDatabaseError(error) {
  const diagnosticParts = [];
  const seen = new Set();
  let current = error;

  for (let depth = 0; current && depth < 3 && !seen.has(current); depth += 1) {
    if (typeof current !== "object" && typeof current !== "function") break;
    seen.add(current);
    if (typeof current.status === "number" && Number.isFinite(current.status)) {
      diagnosticParts.push(current.status === 0
        ? "no HTTP response (network/transport failure)"
        : `HTTP ${current.status}`);
    }
    if (typeof current.statusText === "string" && current.statusText.trim()) {
      diagnosticParts.push(redactDiagnostic(current.statusText.trim()));
    }
    if (typeof current.code === "string" && current.code.trim()) {
      diagnosticParts.push(`code ${current.code.trim()}`);
    }
    if (typeof current.message === "string" && current.message.trim()) {
      diagnosticParts.push(redactDiagnostic(current.message.trim()));
    }
    current = current.cause;
  }

  const details = [...new Set(diagnosticParts)].join("; ");
  return new Error(
    `Supabase request failed${details ? `: ${details}` : ""}. Check the project URL, API key, schema, and network connection.`
  );
}

export function createDiagnosticFetch(fetchImpl = fetch) {
  return async (input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      const causeParts = [];
      const seen = new Set();
      let cause = error?.cause;
      for (let depth = 0; cause && depth < 3 && !seen.has(cause); depth += 1) {
        if (typeof cause !== "object" && typeof cause !== "function") break;
        seen.add(cause);
        if (typeof cause.code === "string" && cause.code.trim()) {
          causeParts.push(cause.code.trim());
        }
        if (typeof cause.message === "string" && cause.message.trim()) {
          causeParts.push(cause.message.trim());
        }
        cause = cause.cause;
      }
      const message = [
        error?.message || "Request failed",
        ...new Set(causeParts)
      ].join("; ");
      const diagnosticError = new Error(message);
      if (error?.name) diagnosticError.name = error.name;
      throw diagnosticError;
    }
  };
}

async function runQuery(query) {
  try {
    const result = await query;
    if (result.error) {
      throw safeDatabaseError({
        ...result.error,
        status: result.status,
        statusText: result.statusText
      });
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Supabase request failed")) {
      throw error;
    }
    throw safeDatabaseError(error);
  }
}

async function checkTable(client, table) {
  await runQuery(client.from(table).select("id").limit(1));
}

async function writeAndVerifyObservation(client, id) {
  const row = {
    id,
    product_id: `gadgetverse-smoke-${id}`,
    store_id: "integration_test",
    price: 1,
    currency: "INR",
    availability: "unknown",
    source_status: "integration_test",
    metadata: { integrationTest: true, comparable: false }
  };
  await runQuery(client.from("price_observations").insert(row));

  const { data } = await runQuery(client
    .from("price_observations")
    .select("id, source_status, metadata")
    .eq("id", id)
    .single());
  if (
    data?.id !== id ||
    data.source_status !== "integration_test" ||
    data.metadata?.integrationTest !== true
  ) {
    throw new Error("Supabase observation read-back did not match the isolated test record.");
  }
}

async function writeAndVerifyAlert(client, id) {
  const email = `gadgetverse-smoke-${id}@example.invalid`;
  await runQuery(client.from("price_alerts").insert({
    id,
    product_id: `gadgetverse-smoke-${id}`,
    product_name: "GadgetVerse isolated database smoke test",
    email,
    target_price: 1,
    enabled: false,
    notification_status: "integration_test"
  }));

  const { data } = await runQuery(client
    .from("price_alerts")
    .select("id, email, enabled, notification_status")
    .eq("id", id)
    .single());
  if (
    data?.id !== id ||
    data.email !== email ||
    data.enabled !== false ||
    data.notification_status !== "integration_test"
  ) {
    throw new Error("Supabase alert read-back did not match the isolated test record.");
  }
}

async function deleteExactRow(client, table, id) {
  const { data } = await runQuery(client.from(table).delete().eq("id", id).select("id"));
  if (data?.length > 1 || data?.some((row) => row.id !== id)) {
    throw new Error(`Could not confirm cleanup of isolated ${table} row ${id}.`);
  }
}

export async function runSupabaseSmoke(client) {
  for (const table of TABLES) {
    await checkTable(client, table);
  }

  const observationId = randomUUID();
  const alertId = randomUUID();
  let observationCreated = false;
  let alertCreated = false;
  let failure;
  const cleanupErrors = [];

  try {
    observationCreated = true;
    await writeAndVerifyObservation(client, observationId);
    alertCreated = true;
    await writeAndVerifyAlert(client, alertId);
  } catch (error) {
    failure = error;
  } finally {
    if (alertCreated) {
      try {
        await deleteExactRow(client, "price_alerts", alertId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (observationCreated) {
      try {
        await deleteExactRow(client, "price_observations", observationId);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (failure || cleanupErrors.length) {
    const cleanupMessage = cleanupErrors.length
      ? ` Cleanup needs manual review: ${cleanupErrors.map((error) => error.message).join("; ")}`
      : "";
    throw new Error(`${failure?.message || "Supabase smoke test cleanup failed."}${cleanupMessage}`);
  }
  return {
    readableTables: TABLES,
    observationWriteReadDelete: "passed",
    alertWriteReadDelete: "passed",
    note: "Temporary rows were unverified/non-comparable and removed after read-back."
  };
}

async function main() {
  loadLocalEnv();
  let config;
  try {
    config = getSupabaseConfig();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  if (!config) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY or SUPABASE_SECRET_KEY in the server environment.");
    process.exitCode = 1;
    return;
  }

  try {
    const client = createSupabaseClient(config, {
      global: { fetch: createDiagnosticFetch() }
    });
    const report = await runSupabaseSmoke(client);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
