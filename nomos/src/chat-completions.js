/**
 * Runner protocol (owned by this route handler):
 *   execute(request)        → Promise<object>         (non-streaming JSON response)
 *   executeStream(request)  → AsyncIterable<event>     (streaming SSE events)
 *
 * Budget protocol (owned by this route handler):
 *   checkBudget(projectId, now?)  → { allowed, remaining, limit, usage }
 *   logUsage({ projectId, model, promptTokens, completionTokens }, now?)
 *
 * request = { model, messages, ...rest }
 * event   = { type: "chunk"|"error"|"end", data?: object }
 */

export function createChatCompletionsHandler({ runner, logger, budgetService }) {
  return async (req, res) => {
    const { model, messages, stream, ...rest } = req.body || {};

    if (!model) {
      return res.status(400).json({
        error: { message: "model is required", type: "invalid_request_error" },
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { message: "messages is required and must be an array", type: "invalid_request_error" },
      });
    }

    // Pre-request budget check (hard stop)
    if (budgetService && req.project) {
      const budget = budgetService.checkBudget(req.project.id);
      if (!budget.allowed) {
        logger.warn("budget exceeded", {
          project_id: req.project.id,
          usage: budget.usage,
          limit: budget.limit,
        });
        return res.status(429).json({
          error: {
            message: "budget exceeded",
            type: "budget_exceeded",
            usage: budget.usage,
            limit: budget.limit,
          },
        });
      }
    }

    const request = { model, messages, ...rest };

    if (stream) {
      return handleStream({ runner, logger, budgetService, request, projectId: req.project?.id, res });
    }

    return handleNonStream({ runner, logger, budgetService, request, projectId: req.project?.id, res });
  };
}

function extractUsage(response) {
  if (!response?.usage) return null;
  return {
    promptTokens: response.usage.prompt_tokens || 0,
    completionTokens: response.usage.completion_tokens || 0,
  };
}

async function handleNonStream({ runner, logger, budgetService, request, projectId, res }) {
  try {
    const response = await runner.execute(request);

    // Post-completion: log token usage
    if (budgetService && projectId) {
      const usage = extractUsage(response);
      if (usage) {
        budgetService.logUsage({
          projectId,
          model: request.model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        });
      }
    }

    res.json(response);
  } catch (err) {
    logger.error("runner execute failed", { error: err.message, model: request.model });
    res.status(502).json({
      error: { message: "upstream request failed", type: "upstream_error" },
    });
  }
}

async function handleStream({ runner, logger, budgetService, request, projectId, res }) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let streamUsage = null;

  try {
    for await (const event of runner.executeStream(request)) {
      if (event.type === "chunk") {
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
        // Capture usage from final chunk if present
        if (event.data?.usage) {
          streamUsage = {
            promptTokens: event.data.usage.prompt_tokens || 0,
            completionTokens: event.data.usage.completion_tokens || 0,
          };
        }
      } else if (event.type === "error") {
        res.write(`data: ${JSON.stringify({ error: event.data })}\n\n`);
      } else if (event.type === "end") {
        res.write("data: [DONE]\n\n");
      }
    }
  } catch (err) {
    logger.error("runner stream failed", { error: err.message, model: request.model });
    res.write(`data: ${JSON.stringify({ error: { message: "upstream stream failed", type: "upstream_error" } })}\n\n`);
    res.write("data: [DONE]\n\n");
  }

  // Post-stream: log token usage if available
  if (budgetService && projectId && streamUsage) {
    budgetService.logUsage({
      projectId,
      model: request.model,
      promptTokens: streamUsage.promptTokens,
      completionTokens: streamUsage.completionTokens,
    });
  }

  res.end();
}
