/**
 * Runner protocol (owned by this route handler):
 *   execute(request)        → Promise<object>         (non-streaming JSON response)
 *   executeStream(request)  → AsyncIterable<event>     (streaming SSE events)
 *
 * request = { model, messages, ...rest }
 * event   = { type: "chunk"|"error"|"end", data?: object }
 */

export function createChatCompletionsHandler({ runner, logger }) {
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

    const request = { model, messages, ...rest };

    if (stream) {
      return handleStream({ runner, logger, request, res });
    }

    return handleNonStream({ runner, logger, request, res });
  };
}

async function handleNonStream({ runner, logger, request, res }) {
  try {
    const response = await runner.execute(request);
    res.json(response);
  } catch (err) {
    logger.error("runner execute failed", { error: err.message, model: request.model });
    res.status(502).json({
      error: { message: "upstream request failed", type: "upstream_error" },
    });
  }
}

async function handleStream({ runner, logger, request, res }) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    for await (const event of runner.executeStream(request)) {
      if (event.type === "chunk") {
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
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

  res.end();
}
