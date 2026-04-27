import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

// Save and restore env vars around each test to avoid cross-contamination.
const CONFIG_KEYS = [
  "NOMOS_PORT", "NOMOS_HOST", "NOMOS_DB_PATH", "NODE_ENV",
  "NOMOS_STUB_ENABLED", "NOMOS_VENDOR_BASE_URL", "NOMOS_VENDOR_TIMEOUT_MS",
  "NOMOS_VENDOR_API_KEY", "NOMOS_FIXTURES_DIR", "NOMOS_SAFEGUARDS_ENABLED",
  "NOMOS_SAFEGUARDS_SANITIZE", "NOMOS_SAFEGUARDS_REINFORCE",
  "NOMOS_SAFEGUARDS_BLOCK", "NOMOS_SAFEGUARDS_REINFORCE_PREPEND",
  "NOMOS_SAFEGUARDS_REINFORCE_APPEND", "NOMOS_JSON_BODY_LIMIT",
];

function clearConfigEnv() {
  const saved = {};
  for (const key of CONFIG_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restoreConfigEnv(saved) {
  for (const key of CONFIG_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

test("loadConfig returns correct defaults when env is empty", () => {
  const saved = clearConfigEnv();
  try {
    const config = loadConfig();
    assert.equal(config.port, 8080);
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.dbPath, "data/nomos.db");
    assert.equal(config.env, "development");
    assert.equal(config.stubEnabled, false);
    assert.equal(config.vendorBaseUrl, "");
    assert.equal(config.vendorTimeoutMs, 30000);
    assert.equal(config.vendorApiKey, "");
    assert.equal(config.fixturesDir, "tests/fixtures");
    assert.equal(config.safeguardsEnabled, true);
    assert.equal(config.safeguardsSanitize, true);
    assert.equal(config.safeguardsReinforce, false);
    assert.equal(config.safeguardsBlockOnDetect, false);
    assert.equal(config.safeguardsReinforcePrepend, "");
    assert.equal(config.safeguardsReinforceAppend, "");
    assert.equal(config.jsonBodyLimit, "100kb");
  } finally {
    restoreConfigEnv(saved);
  }
});

test("loadConfig parses numeric env vars as integers", () => {
  const saved = clearConfigEnv();
  try {
    process.env.NOMOS_PORT = "3000";
    process.env.NOMOS_VENDOR_TIMEOUT_MS = "5000";
    const config = loadConfig();
    assert.equal(config.port, 3000);
    assert.equal(config.vendorTimeoutMs, 5000);
  } finally {
    restoreConfigEnv(saved);
  }
});

test("loadConfig strips trailing slashes from vendorBaseUrl", () => {
  const saved = clearConfigEnv();
  try {
    process.env.NOMOS_VENDOR_BASE_URL = "https://api.example.com///";
    const config = loadConfig();
    assert.equal(config.vendorBaseUrl, "https://api.example.com");
  } finally {
    restoreConfigEnv(saved);
  }
});

test("loadConfig boolean fields use strict equality", () => {
  const saved = clearConfigEnv();
  try {
    // === "true" fields: only "true" is truthy
    process.env.NOMOS_STUB_ENABLED = "true";
    process.env.NOMOS_SAFEGUARDS_REINFORCE = "true";
    process.env.NOMOS_SAFEGUARDS_BLOCK = "true";
    // !== "false" fields: only "false" disables
    process.env.NOMOS_SAFEGUARDS_ENABLED = "false";
    process.env.NOMOS_SAFEGUARDS_SANITIZE = "false";

    const config = loadConfig();
    assert.equal(config.stubEnabled, true);
    assert.equal(config.safeguardsReinforce, true);
    assert.equal(config.safeguardsBlockOnDetect, true);
    assert.equal(config.safeguardsEnabled, false);
    assert.equal(config.safeguardsSanitize, false);
  } finally {
    restoreConfigEnv(saved);
  }
});

test("loadConfig reads string env vars", () => {
  const saved = clearConfigEnv();
  try {
    process.env.NOMOS_HOST = "127.0.0.1";
    process.env.NOMOS_DB_PATH = "/tmp/custom.db";
    process.env.NODE_ENV = "production";
    process.env.NOMOS_VENDOR_API_KEY = "sk-secret";
    process.env.NOMOS_FIXTURES_DIR = "/custom/fixtures";
    process.env.NOMOS_JSON_BODY_LIMIT = "1mb";
    process.env.NOMOS_SAFEGUARDS_REINFORCE_PREPEND = "BE SAFE";
    process.env.NOMOS_SAFEGUARDS_REINFORCE_APPEND = "END SAFE";

    const config = loadConfig();
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.dbPath, "/tmp/custom.db");
    assert.equal(config.env, "production");
    assert.equal(config.vendorApiKey, "sk-secret");
    assert.equal(config.fixturesDir, "/custom/fixtures");
    assert.equal(config.jsonBodyLimit, "1mb");
    assert.equal(config.safeguardsReinforcePrepend, "BE SAFE");
    assert.equal(config.safeguardsReinforceAppend, "END SAFE");
  } finally {
    restoreConfigEnv(saved);
  }
});
