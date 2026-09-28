import type { Logger } from "./logging.js";
import type { RuntimeAdapter, TurnObserver, TurnRequest } from "./runtime.js";

// Logging decorator for any runtime adapter. It sees only the port's boundary
// (request in, events through, result out) and changes none of them: same
// runtime, capabilities, events and result, and exceptions are rethrown.

const WARN_EVENTS = new Set(["PROVIDER_ERROR", "PROVIDER_RETRY", "RATE_LIMITED", "STREAM_PARSE_ERROR", "SESSION_ID_MISMATCH", "TIMEOUT", "SPAWN_FAILED"]);

export function withLogging(adapter: RuntimeAdapter, logger: Logger, clock: () => number = Date.now): RuntimeAdapter {
  return {
    runtime: adapter.runtime,
    capabilities: adapter.capabilities,
    resumeHint: (sessionId) => adapter.resumeHint(sessionId),

    async runTurn(request, observer) {
      const started = clock();
      const counts: Record<string, number> = {};
      logger.log("info", "turn.started", { runtime: adapter.runtime, ...describeRequest(request) });

      const counting: TurnObserver = {
        event(event) {
          counts[event.kind] = (counts[event.kind] ?? 0) + 1;
          logger.log(WARN_EVENTS.has(event.kind) ? "warn" : "debug", "turn.event", {
            runtime: adapter.runtime,
            kind: event.kind,
            source: event.source,
            ...(WARN_EVENTS.has(event.kind) ? { data: event.data } : {}),
          });
          observer.event(event);
        },
      };
      if (observer.raw) counting.raw = (line) => observer.raw!(line);

      try {
        const result = await adapter.runTurn(request, counting);
        logger.log(result.outcome === "completed" ? "info" : "warn", "turn.finished", {
          runtime: adapter.runtime,
          outcome: result.outcome,
          reason: result.reason,
          providerSessionId: result.providerSessionId,
          exit: result.exit,
          costUsd: result.costUsd,
          wallMs: clock() - started,
          events: counts,
        });
        return result;
      } catch (error) {
        logger.log("error", "turn.crashed", {
          runtime: adapter.runtime,
          error: error instanceof Error ? error.stack ?? error.message : String(error),
          wallMs: clock() - started,
          events: counts,
        });
        throw error;
      }
    },
  };
}

function describeRequest(request: TurnRequest): Record<string, unknown> {
  return {
    cwd: request.cwd,
    model: request.model,
    effort: request.effort,
    sessionId: request.sessionId,
    workspace: request.policy.workspace,
    isolateConfig: request.policy.isolateConfig,
    timeoutMs: request.policy.timeoutMs,
    tools: request.policy.tools,
    outputSchema: request.outputSchema !== undefined,
    promptChars: request.prompt.length,
  };
}
