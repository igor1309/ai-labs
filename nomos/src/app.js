import express from "express";
import { createAuthMiddleware } from "./auth.js";

export function createApp({ logger, db }) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/v1", createAuthMiddleware({ db, logger, allowedScope: "live" }));
  app.use("/stub/v1", createAuthMiddleware({ db, logger, allowedScope: "stub" }));

  app.use((err, _req, res, _next) => {
    logger.error("unhandled error", { error: err.message });
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
