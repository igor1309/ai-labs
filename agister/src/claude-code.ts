import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type { RuntimeAdapter, RuntimeEvent, TurnObserver, TurnRequest, TurnResult } from "./runtime.js";

// Claude Code adapter: one headless `claude -p` process per turn, reading the
// stream-json protocol from stdout.
//
// Outcome precedence follows what each signal proves:
// 1. The provider's `result` message decides the turn outcome. A provider
//    error is never rewritten into success because the process exits 0.
// 2. Without a result, Agister's own timeout or abort means interrupted.
// 3. Without a result, a non-zero exit or spawn failure means failed.
// 4. A clean exit without any result is lost: nothing proves what happened.

const KILL_GRACE_MS = 5_000;
const STDERR_TAIL_BYTES = 4_096;

export interface ClaudeCodeAdapterOptions {
  command?: string;
  killGraceMs?: number;
}

export function claudeCodeAdapter(options: ClaudeCodeAdapterOptions = {}): RuntimeAdapter {
  const command = options.command ?? "claude";
  const killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;

  return {
    runtime: "claude-code",
    runTurn: (request, observer) => runClaudeTurn(command, killGraceMs, request, observer),
  };
}

export function claudeArguments(request: TurnRequest): string[] {
  const { policy } = request;
  // The prompt goes through stdin: variadic flags such as --tools would
  // otherwise swallow a trailing positional prompt, and diffs can be large.
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--session-id", request.sessionId,
    "--permission-mode", "dontAsk",
    `--tools=${policy.tools.join(",")}`,
  ];
  if (policy.allowedTools.length > 0) args.push(`--allowedTools=${policy.allowedTools.join(",")}`);
  if (policy.restricted) args.push("--restricted", "--strict-mcp-config");
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("--effort", request.effort);
  if (request.appendSystemPrompt) args.push("--append-system-prompt", request.appendSystemPrompt);
  if (request.outputSchema) args.push("--json-schema", JSON.stringify(request.outputSchema));
  return args;
}

// ---------------------------------------------------------------------------
// Stream reduction (pure)

export interface StreamState {
  requestedSessionId: string;
  providerSessionId?: string;
  model?: string;
  lastText?: string;
  result?: Record<string, unknown>;
}

export function createStreamState(requestedSessionId: string): StreamState {
  return { requestedSessionId };
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
    if (sessionId !== state.requestedSessionId) {
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

export interface ProcessEvidence {
  exit?: { code: number | null; signal: string | null };
  spawnError?: string;
  timedOut: boolean;
  aborted: boolean;
  stderrTail?: string;
  schemaRequested: boolean;
}

export function reconcileTurn(state: StreamState, evidence: ProcessEvidence): TurnResult {
  const base: TurnResult = { outcome: "lost" };
  if (state.providerSessionId) base.providerSessionId = state.providerSessionId;
  if (state.model) base.model = state.model;
  if (evidence.exit) base.exit = evidence.exit;
  if (evidence.stderrTail) base.stderrTail = evidence.stderrTail;

  const result = state.result;
  if (result) {
    const turn: TurnResult = { ...base };
    if (typeof result["total_cost_usd"] === "number") turn.costUsd = result["total_cost_usd"];
    if (typeof result["duration_ms"] === "number") turn.durationMs = result["duration_ms"];
    if (typeof result["num_turns"] === "number") turn.numTurns = result["num_turns"];
    if (Array.isArray(result["permission_denials"])) turn.permissionDenials = result["permission_denials"];
    const text = typeof result["result"] === "string" && result["result"] !== "" ? result["result"] : state.lastText;
    if (text !== undefined) turn.text = text;
    if (result["structured_output"] !== undefined) turn.structuredOutput = result["structured_output"];

    if (result["subtype"] !== "success" || result["is_error"] === true) {
      const errors = Array.isArray(result["errors"]) ? `: ${result["errors"].join("; ")}` : "";
      return { ...turn, outcome: "failed", reason: `provider_${String(result["subtype"])}${errors}` };
    }
    if (evidence.schemaRequested && turn.structuredOutput === undefined) {
      return { ...turn, outcome: "failed", reason: "missing_structured_output" };
    }
    return { ...turn, outcome: "completed" };
  }

  if (evidence.timedOut) return { ...base, outcome: "interrupted", reason: "timeout" };
  if (evidence.aborted) return { ...base, outcome: "interrupted", reason: "aborted" };
  if (evidence.spawnError) return { ...base, outcome: "failed", reason: `spawn_failed: ${evidence.spawnError}` };
  if (evidence.exit?.code !== null && evidence.exit?.code !== undefined && evidence.exit.code !== 0) {
    return { ...base, outcome: "failed", reason: `exit_code_${evidence.exit.code}` };
  }
  if (evidence.exit?.signal) return { ...base, outcome: "lost", reason: `killed_by_${evidence.exit.signal}` };
  return { ...base, outcome: "lost", reason: "exited_without_result" };
}

// ---------------------------------------------------------------------------
// Process supervision

function runClaudeTurn(
  command: string,
  killGraceMs: number,
  request: TurnRequest,
  observer: TurnObserver,
): Promise<TurnResult> {
  const state = createStreamState(request.sessionId);
  const args = claudeArguments(request);
  const evidence: ProcessEvidence = {
    timedOut: false,
    aborted: false,
    schemaRequested: request.outputSchema !== undefined,
  };

  return new Promise((resolve) => {
    // Own process group, so termination reaches everything the CLI spawned.
    const child = spawn(command, args, { cwd: request.cwd, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = () => {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
      signalGroup(child.pid, "SIGTERM");
      killTimer = setTimeout(() => signalGroup(child.pid!, "SIGKILL"), killGraceMs);
      killTimer.unref();
    };

    const timeout = setTimeout(() => {
      evidence.timedOut = true;
      observer.event({ source: "adapter", kind: "TIMEOUT", data: { timeoutMs: request.policy.timeoutMs } });
      terminate();
    }, request.policy.timeoutMs);

    const onAbort = () => {
      evidence.aborted = true;
      observer.event({ source: "adapter", kind: "ABORT_REQUESTED" });
      terminate();
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      request.signal?.removeEventListener("abort", onAbort);
      if (stderr.trim() !== "") evidence.stderrTail = stderr.trim();
      resolve(reconcileTurn(state, evidence));
    };

    child.on("error", (error) => {
      evidence.spawnError = error.message;
      observer.event({ source: "process", kind: "SPAWN_FAILED", data: { error: error.message } });
      if (child.pid === undefined) finish();
    });

    if (child.pid === undefined) return;
    observer.event({ source: "process", kind: "PROCESS_STARTED", data: { pid: child.pid, command, args } });

    child.stdin.on("error", () => {});
    child.stdin.end(request.prompt);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_BYTES);
    });

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      observer.raw?.(line);
      for (const event of reduceStreamLine(state, line)) observer.event(event);
    });

    child.on("close", (code, signal) => {
      evidence.exit = { code, signal };
      observer.event({ source: "process", kind: "PROCESS_EXITED", data: { code, signal } });
      finish();
    });
  });
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

function contentBlocks(message: Record<string, any>): Array<Record<string, any>> {
  const content = message["message"]?.content;
  return Array.isArray(content) ? content : [];
}

function pick(source: Record<string, any>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
