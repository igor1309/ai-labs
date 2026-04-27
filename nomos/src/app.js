import express from "express";
import { createAuthMiddleware } from "./auth.js";
import { createChatCompletionsHandler } from "./chat-completions.js";

export function createApp({ logger, db, version = null, liveRunner = null, stubRunner = null, stubEnabled = false, budgetService = null, safeguards = null, jsonBodyLimit = "100kb" }) {
  const app = express();

  app.get("/health", (_req, res) => {
    const body = { status: "ok" };
    if (version) body.version = version;
    res.json(body);
  });

  app.use(express.json({ limit: jsonBodyLimit }));

  // Live API: /v1/*
  app.use("/v1", createAuthMiddleware({ db, logger, allowedScope: "live" }));

  // Usage report endpoint
  if (budgetService) {
    app.get("/v1/usage", (req, res) => {
      const projectId = req.project?.id;
      if (!projectId) {
        return res.status(400).json({ error: "project not identified" });
      }
      const report = budgetService.getUsageReport(projectId);
      res.json(report);
    });
  }

  if (liveRunner) {
    app.post("/v1/chat/completions", createChatCompletionsHandler({ runner: liveRunner, logger, budgetService, safeguards }));
  }

  // Stub API: /stub/v1/* (gated by config)
  if (stubEnabled && stubRunner) {
    app.use("/stub/v1", createAuthMiddleware({ db, logger, allowedScope: "stub" }));
    app.post("/stub/v1/chat/completions", createChatCompletionsHandler({ runner: stubRunner, logger, budgetService, safeguards }));
  } else {
    app.use("/stub", (_req, res) => {
      res.status(404).json({ error: "not found" });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    logger.error("unhandled error", { error: err.message, status });
    if (status === 413 && err.type === "entity.too.large") {
      return res.status(status).json({
        error: `Nomos rejected request body before routing: request body exceeds JSON limit (current limit: ${jsonBodyLimit}).`,
      });
    }

    res.status(status).json({
      error: status < 500 ? err.message : "internal server error",
    });
  });

  return app;
}
