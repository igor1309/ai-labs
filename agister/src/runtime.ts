// Provider-neutral contract between Agister and a runtime adapter.
//
// One call runs one provider turn in a fresh process. The adapter owns every
// provider detail (arguments, stream format, exit semantics) and reports a
// normalized outcome plus ordered events. It never decides whether the task
// itself succeeded; that belongs to the process or workflow above it.

export type TurnOutcome = "completed" | "failed" | "interrupted" | "lost";

export interface ExecutionPolicy {
  // Built-in tools exposed to the agent. An empty list exposes none.
  tools: string[];
  // Permission rules that run without asking, e.g. "Bash(git diff:*)".
  // Anything else is denied: turns are unattended.
  allowedTools: string[];
  // Ask the runtime to ignore user/project settings, MCP servers and to confine
  // file tools to the working directory, where it supports that.
  restricted: boolean;
  timeoutMs: number;
}

export interface TurnRequest {
  prompt: string;
  cwd: string;
  // Agister-minted provider session ID, so the run knows it before the
  // provider reports anything. The provider's reported ID is still recorded.
  sessionId: string;
  model?: string;
  effort?: string;
  appendSystemPrompt?: string;
  outputSchema?: object;
  policy: ExecutionPolicy;
  signal?: AbortSignal;
}

export type EventSource = "protocol" | "process" | "adapter";

export interface RuntimeEvent {
  source: EventSource;
  kind: string;
  data?: Record<string, unknown>;
}

export interface TurnResult {
  outcome: TurnOutcome;
  reason?: string;
  providerSessionId?: string;
  model?: string;
  structuredOutput?: unknown;
  text?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  permissionDenials?: unknown[];
  exit?: { code: number | null; signal: string | null };
  stderrTail?: string;
}

export interface TurnObserver {
  event(event: RuntimeEvent): void;
  // Raw provider output, kept verbatim for diagnosis.
  raw?(line: string): void;
}

export interface RuntimeAdapter {
  readonly runtime: string;
  runTurn(request: TurnRequest, observer: TurnObserver): Promise<TurnResult>;
}
