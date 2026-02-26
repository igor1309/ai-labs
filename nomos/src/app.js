import express from "express";
import { createAuthMiddleware } from "./auth.js";
import { createChatCompletionsHandler } from "./chat-completions.js";

export function createApp({ logger, db, liveRunner = null, stubRunner = null, stubEnabled = false }) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(express.json());

  // Live API: /v1/*
  app.use("/v1", createAuthMiddleware({ db, logger, allowedScope: "live" }));
  if (liveRunner) {
    app.post("/v1/chat/completions", createChatCompletionsHandler({ runner: liveRunner, logger }));
  }

  // Stub API: /stub/v1/* (gated by config)
  if (stubEnabled && stubRunner) {
    app.use("/stub/v1", createAuthMiddleware({ db, logger, allowedScope: "stub" }));
    app.post("/stub/v1/chat/completions", createChatCompletionsHandler({ runner: stubRunner, logger }));
  } else {
    app.use("/stub", (_req, res) => {
      res.status(404).json({ error: "not found" });
    });
  }

  app.use((err, _req, res, _next) => {
    logger.error("unhandled error", { error: err.message });
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
