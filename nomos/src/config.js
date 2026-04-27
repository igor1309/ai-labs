export function loadConfig() {
  const jsonBodyLimit = process.env.NOMOS_JSON_BODY_LIMIT || "1MB";
  validateJsonBodyLimit(jsonBodyLimit);

  return {
    port: parseInt(process.env.NOMOS_PORT || "8080", 10),
    host: process.env.NOMOS_HOST || "0.0.0.0",
    dbPath: process.env.NOMOS_DB_PATH || "data/nomos.db",
    env: process.env.NODE_ENV || "development",
    jsonBodyLimit,
    stubEnabled: process.env.NOMOS_STUB_ENABLED === "true",
    vendorBaseUrl: (process.env.NOMOS_VENDOR_BASE_URL || "").replace(/\/+$/, ""),
    vendorTimeoutMs: parseInt(process.env.NOMOS_VENDOR_TIMEOUT_MS || "30000", 10),
    vendorApiKey: process.env.NOMOS_VENDOR_API_KEY || "",
    fixturesDir: process.env.NOMOS_FIXTURES_DIR || "tests/fixtures",
    safeguardsEnabled: process.env.NOMOS_SAFEGUARDS_ENABLED !== "false",
    safeguardsSanitize: process.env.NOMOS_SAFEGUARDS_SANITIZE !== "false",
    safeguardsReinforce: process.env.NOMOS_SAFEGUARDS_REINFORCE === "true",
    safeguardsBlockOnDetect: process.env.NOMOS_SAFEGUARDS_BLOCK === "true",
    safeguardsReinforcePrepend: process.env.NOMOS_SAFEGUARDS_REINFORCE_PREPEND || "",
    safeguardsReinforceAppend: process.env.NOMOS_SAFEGUARDS_REINFORCE_APPEND || "",
  };
}

function validateJsonBodyLimit(value) {
  const match = value.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i);
  if (!match || Number(match[1]) <= 0) {
    throw new Error("NOMOS_JSON_BODY_LIMIT must be a positive size such as 100kb, 2mb, or 1048576");
  }
}
