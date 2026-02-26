import express from "express";

export function createApp({ logger, db }) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use((err, _req, res, _next) => {
    logger.error("unhandled error", { error: err.message });
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
