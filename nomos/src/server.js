import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig();
const logger = createLogger();
const db = openDb(config.dbPath);
const app = createApp({ logger, db });

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
