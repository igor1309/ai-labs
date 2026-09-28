import {
  baseResult,
  reconcileWithoutTerminal,
  superviseProcess,
  truncate,
  type ProcessEvidence,
  type SupervisedProcess,
} from "./process-supervisor.js";
import type { ExecutionPolicy, RuntimeAdapter, RuntimeEvent, TurnObserver, TurnRequest, TurnResult } from "./runtime.js";

// Claude Code adapter: one headless `claude -p` process per turn, reading the
// stream-json protocol from stdout.
//
// Outcome precedence follows what each signal proves:
// 1. The provider's `result` message decides the turn outcome. A provider
//    error is never rewritten into success because the process exits 0.
// 2. Without a result, Agister's own timeout or abort means interrupted.
// 3. Without a result, a non-zero exit or spawn failure means failed.
// 4. A clean exit without any result is lost: nothing proves what happened.

export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
const DEFAULT_TOOLS = {
  "read-only": ["Read", "Grep", "Glob"],
  "workspace-write": ["Read", "Grep", "Glob", "Edit", "Write"],
};

export interface ClaudeCodeAdapterOptions {
  command?: string;
  killGraceMs?: number;
}

export function claudeCodeAdapter(options: ClaudeCodeAdapterOptions = {}): RuntimeAdapter {
  const command = options.command ?? "claude";

  return {
    runtime: "claude-code",
    capabilities: { presetSessionId: true, toolSurface: true },
    runTurn: (request, observer) => runClaudeTurn(command, options.killGraceMs, request, observer),
    resumeHint: (sessionId) => `claude --resume ${sessionId}`,
  };
}

// Claude Code has no OS sandbox here: the workspace policy is enforced by the
// tool surface, so a read-only policy must not expose write tools.
export function claudeToolSurface(policy: ExecutionPolicy): { expose: string[]; allow: string[] } {
  if (!policy.tools) {
    const tools = DEFAULT_TOOLS[policy.workspace];
    return { expose: tools, allow: tools };
  }
  if (policy.workspace === "read-only") {
    const writable = policy.tools.expose.filter((tool) => WRITE_TOOLS.includes(tool));
    if (writable.length > 0) throw new Error(`read-only policy exposes write tools: ${writable.join(", ")}`);
  }
  return policy.tools;
}

export function claudeArguments(request: TurnRequest): string[] {
  const { policy } = request;
  const surface = claudeToolSurface(policy);
  // The prompt goes through stdin: variadic flags such as --tools would
  // otherwise swallow a trailing positional prompt, and diffs can be large.
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "dontAsk",
    `--tools=${surface.expose.join(",")}`,
  ];
  if (request.sessionId) args.push("--session-id", request.sessionId);
  if (surface.allow.length > 0) args.push(`--allowedTools=${surface.allow.join(",")}`);
  if (policy.isolateConfig) args.push("--restricted", "--strict-mcp-config");
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("--effort", request.effort);
  if (request.appendSystemPrompt) args.push("--append-system-prompt", request.appendSystemPrompt);
  if (request.outputSchema) args.push("--json-schema", JSON.stringify(request.outputSchema));
  return args;
}

// ---------------------------------------------------------------------------
// Stream reduction (pure)

export interface StreamState {
  requestedSessionId?: string;
  providerSessionId?: string;
  model?: string;
  lastText?: string;
  result?: Record<string, unknown>;
}

export function createStreamState(requestedSessionId?: string): StreamState {
  return requestedSessionId ? { requestedSessionId } : {};
}

export function reduceStreamLine(state: StreamState, line: string): RuntimeEvent[] {
  if (line.trim() === "") return [];

  let message: Record<string, any>;
  try {
    message = JSON.parse(line);
  } catch {
    return [{ source: "adapter", kind: "STREAM_PARSE_ERROR", data: { line: truncate(line, 200) } }];
  }
  if (typeof message !== "object" || message === null) return [];

  switch (message["type"]) {
    case "system":
      return reduceSystem(state, message);
    case "assistant":
      return reduceAssistant(state, message);
    case "user":
      return reduceUser(message);
    case "result":
      return reduceResult(state, message);
    case "rate_limit_event": {
      const status = message["rate_limit_info"]?.status;
      return status && status !== "allowed"
        ? [{ source: "protocol", kind: "RATE_LIMITED", data: { status, resetsAt: message["rate_limit_info"]?.resetsAt } }]
        : [];
    }
    default:
      return [];
  }
}

function reduceSystem(state: StreamState, message: Record<string, any>): RuntimeEvent[] {
  if (message["subtype"] === "init") {
    const sessionId = message["session_id"] as string | undefined;
    if (sessionId !== undefined) state.providerSessionId = sessionId;
    if (typeof message["model"] === "string") state.model = message["model"];
    const events: RuntimeEvent[] = [{
      source: "protocol",
      kind: "PROVIDER_SESSION_BOUND",
      data: {
        providerSessionId: sessionId,
        model: message["model"],
        permissionMode: message["permissionMode"],
        tools: message["tools"],
        cwd: message["cwd"],
      },
    }];
    if (state.requestedSessionId && sessionId !== state.requestedSessionId) {
      events.push({
        source: "adapter",
        kind: "SESSION_ID_MISMATCH",
        data: { requested: state.requestedSessionId, reported: sessionId },
      });
    }
    return events;
  }
  if (message["subtype"] === "api_retry") {
    return [{ source: "protocol", kind: "PROVIDER_RETRY", data: pick(message, ["attempt", "max_retries", "error_status", "error"]) }];
  }
  return [];
}

function reduceAssistant(state: StreamState, message: Record<string, any>): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const block of contentBlocks(message)) {
    if (block.type === "tool_use") {
      events.push({
        source: "protocol",
        kind: "TOOL_REQUESTED",
        data: { toolUseId: block.id, name: block.name, input: truncate(JSON.stringify(block.input ?? {}), 300) },
      });
    } else if (block.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      state.lastText = block.text;
      events.push({ source: "protocol", kind: "ASSISTANT_TEXT", data: { text: truncate(block.text, 500) } });
    }
  }
  return events;
}

function reduceUser(message: Record<string, any>): RuntimeEvent[] {
  return contentBlocks(message)
    .filter((block) => block.type === "tool_result")
    .map((block) => ({
      source: "protocol" as const,
      kind: "TOOL_RESULT",
      data: { toolUseId: block.tool_use_id, isError: block.is_error === true },
    }));
}

function reduceResult(state: StreamState, message: Record<string, any>): RuntimeEvent[] {
  state.result = message;
  if (!state.providerSessionId && typeof message["session_id"] === "string") {
    state.providerSessionId = message["session_id"];
  }
  const succeeded = message["subtype"] === "success" && message["is_error"] !== true;
  return [{
    source: "protocol",
    kind: succeeded ? "TURN_COMPLETED" : "TURN_FAILED",
    data: {
      subtype: message["subtype"],
      isError: message["is_error"],
      terminalReason: message["terminal_reason"],
      numTurns: message["num_turns"],
      durationMs: message["duration_ms"],
      costUsd: message["total_cost_usd"],
      permissionDenials: Array.isArray(message["permission_denials"]) ? message["permission_denials"].length : undefined,
      errors: message["errors"],
    },
  }];
}

// ---------------------------------------------------------------------------
// Outcome reconciliation (pure)

export function reconcileTurn(state: StreamState, evidence: ProcessEvidence, schemaRequested: boolean): TurnResult {
  const base = baseResult(evidence);
  if (state.providerSessionId) base.providerSessionId = state.providerSessionId;
  if (state.model) base.model = state.model;

  const result = state.result;
  if (!result) return reconcileWithoutTerminal(base, evidence);

  const turn: TurnResult = { ...base };
  if (typeof result["total_cost_usd"] === "number") turn.costUsd = result["total_cost_usd"];
  if (typeof result["duration_ms"] === "number") turn.durationMs = result["duration_ms"];
  if (typeof result["num_turns"] === "number") turn.numTurns = result["num_turns"];
  if (typeof result["usage"] === "object" && result["usage"] !== null) turn.usage = result["usage"] as Record<string, unknown>;
  if (Array.isArray(result["permission_denials"])) turn.permissionDenials = result["permission_denials"];
  const text = typeof result["result"] === "string" && result["result"] !== "" ? result["result"] : state.lastText;
  if (text !== undefined) turn.text = text;
  if (result["structured_output"] !== undefined) turn.structuredOutput = result["structured_output"];

  if (result["subtype"] !== "success" || result["is_error"] === true) {
    const errors = Array.isArray(result["errors"]) ? `: ${result["errors"].join("; ")}` : "";
    return { ...turn, outcome: "failed", reason: `provider_${String(result["subtype"])}${errors}` };
  }
  if (schemaRequested && turn.structuredOutput === undefined) {
    return { ...turn, outcome: "failed", reason: "missing_structured_output" };
  }
  return { ...turn, outcome: "completed" };
}

async function runClaudeTurn(
  command: string,
  killGraceMs: number | undefined,
  request: TurnRequest,
  observer: TurnObserver,
): Promise<TurnResult> {
  let args: string[];
  try {
    args = claudeArguments(request);
  } catch (error) {
    return { outcome: "failed", reason: `invalid_policy: ${error instanceof Error ? error.message : String(error)}` };
  }
  const state = createStreamState(request.sessionId);
  const spec: SupervisedProcess = {
    command,
    args,
    cwd: request.cwd,
    stdin: request.prompt,
    timeoutMs: request.policy.timeoutMs,
  };
  if (request.signal) spec.signal = request.signal;
  if (killGraceMs !== undefined) spec.killGraceMs = killGraceMs;

  const evidence = await superviseProcess(spec, observer, (line) => {
    for (const event of reduceStreamLine(state, line)) observer.event(event);
  });
  return reconcileTurn(state, evidence, request.outputSchema !== undefined);
}

function contentBlocks(message: Record<string, any>): Array<Record<string, any>> {
  const content = message["message"]?.content;
  return Array.isArray(content) ? content : [];
}

function pick(source: Record<string, any>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}
