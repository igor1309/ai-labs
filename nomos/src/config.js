export function loadConfig() {
  return {
    port: parseInt(process.env.NOMOS_PORT || "8080", 10),
    host: process.env.NOMOS_HOST || "0.0.0.0",
    dbPath: process.env.NOMOS_DB_PATH || "data/nomos.db",
    env: process.env.NODE_ENV || "development",
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
