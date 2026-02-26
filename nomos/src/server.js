import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDb } from "./db.js";
import { initSchema } from "./schema.js";
import { createApp } from "./app.js";
import { createLiveRunner } from "./live-runner.js";
import { createStubRunner } from "./stub-runner.js";

const config = loadConfig();
const logger = createLogger();
const db = openDb(config.dbPath);
initSchema(db);

const liveRunner = config.vendorBaseUrl
  ? createLiveRunner({
      baseUrl: config.vendorBaseUrl,
      timeoutMs: config.vendorTimeoutMs,
      headers: config.vendorApiKey
        ? { Authorization: `Bearer ${config.vendorApiKey}` }
        : {},
    })
  : null;

const stubRunner = config.stubEnabled
  ? createStubRunner({ fixturesDir: config.fixturesDir })
  : null;

const app = createApp({
  logger,
  db,
  liveRunner,
  stubRunner,
  stubEnabled: config.stubEnabled,
});

const server = app.listen(config.port, config.host, () => {
  logger.info("nomos started", { port: config.port, host: config.host, env: config.env });
});

function shutdown() {
  logger.info("shutting down");
  server.close(() => {
    db.close();
    logger.info("shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
