import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  baseResult,
  reconcileWithoutTerminal,
  superviseProcess,
  truncate,
  type ProcessEvidence,
  type SupervisedProcess,
} from "./process-supervisor.js";
import type { RuntimeAdapter, RuntimeEvent, TurnObserver, TurnRequest, TurnResult } from "./runtime.js";

// Codex adapter: one `codex exec --json` process per turn, reading JSONL
// thread events from stdout.
//
// Differences from Claude Code that the adapter absorbs:
// - The provider mints the thread ID (`thread.started`); Agister cannot preset it.
// - Top-level `error` events and `error` items are not terminal: Codex emits
//   them for reconnect attempts and transport fallbacks mid-turn. Only
//   `turn.completed` / `turn.failed` decide the turn outcome.
// - Structured output is the final agent message, constrained by
//   `--output-schema`, which must be a file.
// - The workspace policy is enforced by Codex's OS sandbox, not a tool list.
// - There is no system-prompt flag; process instructions are prepended to
//   the prompt in a delimited block.

export const CODEX_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export interface CodexAdapterOptions {
  command?: string;
  killGraceMs?: number;
}

export function codexAdapter(options: CodexAdapterOptions = {}): RuntimeAdapter {
  const command = options.command ?? "codex";

  return {
    runtime: "codex",
    capabilities: { presetSessionId: false, toolSurface: false },
    runTurn: (request, observer) => runCodexTurn(command, options.killGraceMs, request, observer),
    resumeHint: (sessionId) => `codex resume ${sessionId}`,
  };
}

export function codexArguments(request: TurnRequest, schemaPath?: string): string[] {
  const { policy } = request;
  if (policy.tools) throw new Error("Codex enforces the workspace policy with its sandbox and takes no tool surface");
  if (request.sessionId) throw new Error("Codex cannot preset a session ID");

  const args = [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--sandbox", policy.workspace,
    "--config", 'approval_policy="never"',
  ];
  if (policy.isolateConfig) args.push("--ignore-user-config", "--ignore-rules");
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("--config", `model_reasoning_effort="${request.effort}"`);
  if (schemaPath) args.push("--output-schema", schemaPath);
  // Read the prompt from stdin.
  args.push("-");
  return args;
}

export function codexPrompt(request: TurnRequest): string {
  if (!request.appendSystemPrompt) return request.prompt;
  return `<instructions>\n${request.appendSystemPrompt}\n</instructions>\n\n${request.prompt}`;
}

// ---------------------------------------------------------------------------
// Stream reduction (pure)

export interface CodexStreamState {
  threadId?: string;
  lastMessage?: string;
  lastError?: string;
  terminal?: { kind: "completed"; usage?: Record<string, unknown> } | { kind: "failed"; message: string };
}

export function createCodexStreamState(): CodexStreamState {
  return {};
}

export function reduceCodexLine(state: CodexStreamState, line: string): RuntimeEvent[] {
  if (line.trim() === "") return [];

  let message: Record<string, any>;
  try {
    message = JSON.parse(line);
  } catch {
    return [{ source: "adapter", kind: "STREAM_PARSE_ERROR", data: { line: truncate(line, 200) } }];
  }
  if (typeof message !== "object" || message === null) return [];

  switch (message["type"]) {
    case "thread.started":
      if (typeof message["thread_id"] === "string") state.threadId = message["thread_id"];
      return [{ source: "protocol", kind: "PROVIDER_SESSION_BOUND", data: { providerSessionId: message["thread_id"] } }];
    case "turn.started":
      return [{ source: "protocol", kind: "TURN_STARTED" }];
    case "item.started":
      return reduceItemStarted(message["item"]);
    case "item.completed":
      return reduceItemCompleted(state, message["item"]);
    case "error":
      state.lastError = String(message["message"] ?? "");
      return [{ source: "protocol", kind: "PROVIDER_ERROR", data: { message: truncate(state.lastError, 300) } }];
    case "turn.completed": {
      const usage = typeof message["usage"] === "object" && message["usage"] !== null ? message["usage"] : undefined;
      state.terminal = usage ? { kind: "completed", usage } : { kind: "completed" };
      return [{ source: "protocol", kind: "TURN_COMPLETED", data: { usage } }];
    }
    case "turn.failed": {
      const errorMessage = String(message["error"]?.message ?? "unknown error");
      state.terminal = { kind: "failed", message: errorMessage };
      return [{ source: "protocol", kind: "TURN_FAILED", data: { error: errorMessage } }];
    }
    default:
      return [];
  }
}

function reduceItemStarted(item: Record<string, any> | undefined): RuntimeEvent[] {
  if (!item) return [];
  const name = toolName(item);
  return name ? [{ source: "protocol", kind: "TOOL_REQUESTED", data: { toolUseId: item["id"], name, input: toolInput(item) } }] : [];
}

function reduceItemCompleted(state: CodexStreamState, item: Record<string, any> | undefined): RuntimeEvent[] {
  if (!item) return [];
  switch (item["type"]) {
    case "agent_message":
      if (typeof item["text"] !== "string") return [];
      state.lastMessage = item["text"];
      return [{ source: "protocol", kind: "ASSISTANT_TEXT", data: { text: truncate(item["text"], 500) } }];
    case "error":
      // Non-fatal by protocol: the turn continues.
      return [{ source: "protocol", kind: "PROVIDER_ERROR", data: { message: truncate(String(item["message"] ?? ""), 300) } }];
    case "command_execution":
    case "file_change":
    case "mcp_tool_call":
    case "web_search": {
      const failed = item["status"] === "failed" || (typeof item["exit_code"] === "number" && item["exit_code"] !== 0);
      return [{ source: "protocol", kind: "TOOL_RESULT", data: { toolUseId: item["id"], isError: failed } }];
    }
    default:
      return [];
  }
}

function toolName(item: Record<string, any>): string | undefined {
  switch (item["type"]) {
    case "command_execution":
      return "command";
    case "file_change":
      return "file_change";
    case "mcp_tool_call":
      return `mcp:${item["server"]}/${item["tool"]}`;
    case "web_search":
      return "web_search";
    default:
      return undefined;
  }
}

function toolInput(item: Record<string, any>): string {
  const input = item["command"] ?? item["query"] ?? item["changes"] ?? item["arguments"] ?? {};
  return truncate(typeof input === "string" ? input : JSON.stringify(input), 300);
}

// ---------------------------------------------------------------------------
// Outcome reconciliation (pure)

export function reconcileCodexTurn(state: CodexStreamState, evidence: ProcessEvidence, schemaRequested: boolean): TurnResult {
  const base = baseResult(evidence);
  if (state.threadId) base.providerSessionId = state.threadId;

  const terminal = state.terminal;
  if (!terminal) return reconcileWithoutTerminal(base, evidence, state.lastError);

  const turn: TurnResult = { ...base };
  if (state.lastMessage !== undefined) turn.text = state.lastMessage;
  if (terminal.kind === "failed") return { ...turn, outcome: "failed", reason: `provider_turn_failed: ${terminal.message}` };
  if (terminal.usage) turn.usage = terminal.usage;

  if (schemaRequested) {
    if (state.lastMessage === undefined) return { ...turn, outcome: "failed", reason: "missing_structured_output" };
    try {
      turn.structuredOutput = JSON.parse(state.lastMessage);
    } catch {
      return { ...turn, outcome: "failed", reason: "structured_output_not_json" };
    }
  }
  return { ...turn, outcome: "completed" };
}

// ---------------------------------------------------------------------------

async function runCodexTurn(
  command: string,
  killGraceMs: number | undefined,
  request: TurnRequest,
  observer: TurnObserver,
): Promise<TurnResult> {
  const scratch = request.outputSchema ? await mkdtemp(join(tmpdir(), "agister-codex-")) : undefined;
  try {
    let schemaPath: string | undefined;
    if (scratch) {
      schemaPath = join(scratch, "output-schema.json");
      await writeFile(schemaPath, JSON.stringify(request.outputSchema));
    }

    let args: string[];
    try {
      args = codexArguments(request, schemaPath);
    } catch (error) {
      return { outcome: "failed", reason: `invalid_policy: ${error instanceof Error ? error.message : String(error)}` };
    }

    const state = createCodexStreamState();
    const spec: SupervisedProcess = {
      command,
      args,
      cwd: request.cwd,
      stdin: codexPrompt(request),
      timeoutMs: request.policy.timeoutMs,
    };
    if (request.signal) spec.signal = request.signal;
    if (killGraceMs !== undefined) spec.killGraceMs = killGraceMs;

    const evidence = await superviseProcess(spec, observer, (line) => {
      for (const event of reduceCodexLine(state, line)) observer.event(event);
    });
    return reconcileCodexTurn(state, evidence, request.outputSchema !== undefined);
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}
