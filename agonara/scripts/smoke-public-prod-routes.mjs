#!/usr/bin/env node

const defaultBaseUrl = "https://agonara.enoa.ai";

export async function runPublicProdRouteSmoke({
  baseUrl = defaultBaseUrl,
  expectedVersion,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  assertNonEmptyString(baseUrl, "baseUrl");
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const learn = await fetchText(fetchImpl, `${normalizedBaseUrl}/learn`, timeoutMs);
  if (learn.statusCode !== 200 || !learn.body.includes("Agonara Learn")) {
    throw new Error("learn_route_failed");
  }

  const admin = await fetchText(fetchImpl, `${normalizedBaseUrl}/admin`, timeoutMs);
  if (admin.statusCode !== 403 || admin.body.includes("admin-app")) {
    throw new Error("admin_gate_failed");
  }

  const health = await fetchJson(fetchImpl, `${normalizedBaseUrl}/operations/health`, timeoutMs);
  if (
    health.statusCode !== 200 ||
    !isRecord(health.body) ||
    health.body.status !== "ok" ||
    (expectedVersion && health.body.version !== expectedVersion)
  ) {
    throw new Error("health_route_failed");
  }

  return {
    adminStatusCode: admin.statusCode,
    healthVersion: health.body.version,
    learnStatusCode: learn.statusCode,
  };
}

async function fetchText(fetchImpl, url, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  return {
    body: await response.text(),
    statusCode: response.status,
  };
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {
    body,
    statusCode: response.status,
  };
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  try {
    return await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new Error(`fetch_failed:${url}:${error.message}`);
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name}_required`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPublicProdRouteSmoke({
    baseUrl: process.env.AGONARA_PUBLIC_SMOKE_BASE_URL,
    expectedVersion: process.env.EXPECTED_VERSION,
  }).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
